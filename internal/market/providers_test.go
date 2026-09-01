package market

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func mockService(t *testing.T, handler http.HandlerFunc, opts Options) *Service {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	opts.Client = server.Client()
	service := New(opts)
	service.coinbaseURL = server.URL
	return service
}
func quoteFor(t *testing.T, s *Service, id string) Quote {
	t.Helper()
	for _, a := range s.Snapshot().Assets {
		if a.ID == id {
			return a.Quote
		}
	}
	t.Fatalf("missing asset %s", id)
	return Quote{}
}
func candles(w http.ResponseWriter) {
	now := time.Now().UTC().Truncate(time.Hour).Unix()
	json.NewEncoder(w).Encode([][]float64{
		{float64(now), 99, 111, 101, 110, 10},
		{float64(now - 3600), 98, 105, 99, 100, 12},
	})
}
func TestCoinbasePublicQuotesAndStaleRecovery(t *testing.T) {
	var failing atomic.Bool
	var priceRequests, historyRequests atomic.Int32
	service := mockService(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("CB-ACCESS-KEY") != "" || r.URL.Query().Has("token") {
			t.Error("public requests must not authenticate")
		}
		if failing.Load() {
			http.Error(w, "unavailable", 503)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/stats") {
			priceRequests.Add(1)
			w.Write([]byte(`{"last":"110","open":"100","high":"112","low":"99"}`))
			return
		}
		if strings.HasSuffix(r.URL.Path, "/candles") {
			historyRequests.Add(1)
			if r.URL.Query().Get("granularity") != "3600" || r.URL.Query().Get("start") == "" || r.URL.Query().Get("end") == "" {
				t.Error("incorrect candle range")
			}
			candles(w)
			return
		}
		t.Errorf("unexpected request %s", r.URL.Path)
	}, Options{})
	service.Refresh(context.Background())
	btc := quoteFor(t, service, "bitcoin")
	if btc.Source != "Coinbase" || btc.Status != "live" || btc.Price != 110 || btc.Change == nil || *btc.Change < 9.99 || len(btc.Chart) != 2 || btc.Chart[0] != 100 || btc.Chart[1] != 110 {
		t.Fatalf("live quote: %+v", btc)
	}
	if btc.ChartUpdatedAt == nil || len(btc.ChartTimes) != 2 || btc.ChartTimes[0] >= btc.ChartTimes[1] {
		t.Fatal("missing chronological history")
	}
	if priceRequests.Load() != 7 || historyRequests.Load() != 7 {
		t.Fatalf("request counts: price=%d history=%d", priceRequests.Load(), historyRequests.Load())
	}
	for _, id := range []string{"bluai", "nvda", "aapl"} {
		q := quoteFor(t, service, id)
		if q.Status != "sample" || q.Note == "" || q.AsOf != nil {
			t.Errorf("unsupported asset must be an explained sample: %s", id)
		}
	}
	snapshot := service.Snapshot()
	if snapshot.RefreshSeconds != 30 || len(snapshot.Feeds) != 1 || snapshot.Feeds[0].Name != "Coinbase" {
		t.Fatal("incorrect public feed configuration")
	}
	// Every price refresh uses Coinbase again; history remains cached for 15 minutes.
	service.Refresh(context.Background())
	if priceRequests.Load() != 14 || historyRequests.Load() != 7 {
		t.Fatal("price and history refresh rates were coupled")
	}
	failing.Store(true)
	service.Refresh(context.Background())
	q := quoteFor(t, service, "bitcoin")
	if q.Status != "stale" || q.Price != btc.Price || len(q.Chart) != 2 {
		t.Fatal("failed refresh lost last known data")
	}
	failing.Store(false)
	service.Refresh(context.Background())
	if quoteFor(t, service, "bitcoin").Status != "live" {
		t.Fatal("recovered quote stayed stale")
	}
}
func TestHistoryFailureDoesNotReplaceRealDataWithSamples(t *testing.T) {
	var failing atomic.Bool
	s := mockService(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/stats") {
			w.Write([]byte(`{"last":"110","open":"100"}`))
			return
		}
		if failing.Load() {
			http.Error(w, "unavailable", 503)
			return
		}
		candles(w)
	}, Options{})
	s.Refresh(context.Background())
	original := quoteFor(t, s, "bitcoin")
	failing.Store(true)
	s.nextHistory = time.Time{}
	s.Refresh(context.Background())
	q := quoteFor(t, s, "bitcoin")
	if q.Status != "live" || len(q.Chart) != len(original.Chart) || !strings.Contains(q.ChartSource, "cached") {
		t.Fatalf("history failure corrupted quote: %+v", q)
	}
	if !q.ChartUpdatedAt.Equal(*original.ChartUpdatedAt) {
		t.Fatal("failed history refresh changed its timestamp")
	}
	initial := mockService(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/stats") {
			w.Write([]byte(`{"last":"110","open":"100"}`))
			return
		}
		http.Error(w, "unavailable", 503)
	}, Options{})
	initial.Refresh(context.Background())
	if q := quoteFor(t, initial, "bitcoin"); q.Status != "live" || len(q.Chart) != 0 {
		t.Fatal("live quote retained a synthetic chart")
	}
}
func TestCoinbaseHistoryFiltersOutOfRangeAndMalformedCandles(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Hour).Unix()
	s := mockService(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode([][]float64{
			{float64(now), 1, 3, 1, 2, 10},
			{float64(now - 2*3600), 1, 3, 1, 1, 10},
			{float64(now - 2*3600), 1, 3, 1, 1, 10},
			{float64(now - 8*24*3600), 1, 3, 1, 99, 10},
			{float64(now + 24*3600), 1, 3, 1, 99, 10},
			{float64(now - 3600), 1},
			{float64(now - 1800), 1, 3, 1, -1, 10},
		})
	}, Options{})
	a, _ := Find("bitcoin")
	values, times, candles, err := s.coinbaseHistory(context.Background(), a)
	if err != nil || len(candles) != 2 || candles[1].High != 3 || candles[1].Volume != 10 || len(values) != 2 || values[0] != 1 || values[1] != 2 || times[1]-times[0] != 7200 {
		t.Fatalf("history normalization: %v %v %v", values, times, err)
	}
}
func TestInvalidCryptoDataNeverBecomesLive(t *testing.T) {
	for _, body := range []string{
		`{"last":"NaN","open":"100"}`,
		`{"last":"110","open":"0"}`,
		`{"last":"-1","open":"100"}`,
		`{"last":"Infinity","open":"100"}`,
		`{"last":"100","open":"1e-320"}`,
		`{"error":"rate limited"}`,
		`not JSON`,
	} {
		t.Run(body, func(t *testing.T) {
			s := mockService(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(body)) }, Options{})
			s.Refresh(context.Background())
			for _, a := range s.Snapshot().Assets {
				if a.Quote.Status != "sample" {
					t.Errorf("invalid quote became live: %s", a.ID)
				}
			}
		})
	}
}
func TestSnapshotIsIndependentAndSafeDuringRefresh(t *testing.T) {
	s := mockService(t, func(w http.ResponseWriter, r *http.Request) { http.Error(w, "unavailable", 503) }, Options{})
	snapshot := s.Snapshot()
	snapshot.Assets[0].Quote.Chart[0] = 999
	*snapshot.Assets[0].Quote.Change = 999
	snapshot.Feeds[0].Status = "changed"
	if next := s.Snapshot(); next.Assets[0].Quote.Chart[0] == 999 || *next.Assets[0].Quote.Change == 999 || next.Feeds[0].Status == "changed" {
		t.Fatal("snapshot exposes mutable cache")
	}
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 30; j++ {
				s.Snapshot()
			}
		}()
	}
	s.Refresh(context.Background())
	wg.Wait()
}
func TestRunRefreshesImmediatelyAndOnTickerUntilCanceled(t *testing.T) {
	calls := make(chan struct{}, 20)
	s := mockService(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/products/BTC-USD/stats" {
			calls <- struct{}{}
		}
		http.Error(w, "unavailable", 503)
	}, Options{})
	if s.interval != 30*time.Second {
		t.Fatal("production refresh interval must be 30 seconds")
	}
	s.interval = 20 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() { defer close(done); s.Run(ctx) }()
	for i := 0; i < 2; i++ {
		select {
		case <-calls:
		case <-time.After(2 * time.Second):
			t.Fatal("missing initial or scheduled refresh")
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("refresh loop did not stop")
	}
}
func TestOfflineCatalogHasNoExternalEffects(t *testing.T) {
	s := mockService(t, func(w http.ResponseWriter, r *http.Request) { t.Error("offline mode contacted a provider") }, Options{Offline: true})
	s.Refresh(context.Background())
	s.Run(context.Background())
	ids := map[string]bool{}
	for _, a := range s.Snapshot().Assets {
		if ids[a.ID] {
			t.Errorf("duplicate asset %s", a.ID)
		}
		ids[a.ID] = true
		if a.Kind == "stock" && a.Region != "North America" && a.Region != "Europe" {
			t.Errorf("stock outside requested region: %s", a.ID)
		}
		if a.Quote.Status != "sample" || a.Quote.AsOf != nil {
			t.Error("sample has a false live timestamp")
		}
	}
	if len(ids) != 19 || !ids["bluai"] || !ids["nvda"] || !ids["aapl"] {
		t.Fatal("catalog is incomplete")
	}
}
