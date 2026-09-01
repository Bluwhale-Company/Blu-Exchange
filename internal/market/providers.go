package market

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

func (s *Service) get(ctx context.Context, endpoint string, into any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("invalid provider request")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Blu-Exchange/1.0")
	response, err := s.opts.Client.Do(req)
	if err != nil {
		return fmt.Errorf("provider unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("provider returned status %d", response.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(into); err != nil {
		return fmt.Errorf("invalid provider response")
	}
	return nil
}

// visitProducts keeps request concurrency independent of visitor count.
// Prices are fetched before optional history, so a chart failure cannot hide a quote.
func visitProducts(ctx context.Context, assets []Asset, visit func(Asset)) {
	var wg sync.WaitGroup
	sem := make(chan struct{}, 3)
	for _, a := range assets {
		wg.Add(1)
		go func(a Asset) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				return
			}
			visit(a)
		}(a)
	}
	wg.Wait()
}

func (s *Service) refreshCrypto(ctx context.Context) {
	products := []Asset{}
	for _, a := range catalog {
		if a.Kind == "crypto" && a.coinbase != "" {
			products = append(products, a)
		}
	}
	var successes atomic.Int32
	var validMu sync.Mutex
	valid := []Asset{}
	visitProducts(ctx, products, func(a Asset) {
		q, err := s.coinbaseQuote(ctx, a)
		if err != nil {
			s.failed(a.ID)
			return
		}
		s.put(a.ID, q)
		successes.Add(1)
		validMu.Lock()
		valid = append(valid, a)
		validMu.Unlock()
	})
	// Mark products skipped by cancellation stale as well.
	validIDs := map[string]bool{}
	for _, a := range valid {
		validIDs[a.ID] = true
	}
	for _, a := range products {
		if !validIDs[a.ID] {
			s.failed(a.ID)
		}
	}
	status := "connected"
	if successes.Load() == 0 {
		status = "unavailable"
	} else if int(successes.Load()) < len(products) {
		status = "partial"
	}
	s.feed("Coinbase", status)
	if time.Now().Before(s.nextHistory) || len(valid) == 0 {
		return
	}
	s.nextHistory = time.Now().Add(historyInterval)
	visitProducts(ctx, valid, func(a Asset) {
		values, times, candles, err := s.coinbaseHistory(ctx, a)
		s.mu.Lock()
		defer s.mu.Unlock()
		q := s.quotes[a.ID]
		if err != nil {
			if len(q.Chart) > 0 {
				q.ChartSource = "Coinbase · cached hourly candles"
			}
			s.quotes[a.ID] = q
			return
		}
		now := time.Now().UTC()
		q.Candles = candles
		q.Chart = values
		q.ChartTimes = times
		q.ChartUpdatedAt = &now
		q.ChartSource = "Coinbase · hourly candles"
		s.quotes[a.ID] = q
	})
}

func (s *Service) coinbaseQuote(ctx context.Context, a Asset) (Quote, error) {
	var row struct {
		Open string `json:"open"`
		High string `json:"high"`
		Low  string `json:"low"`
		Last string `json:"last"`
	}
	err := s.get(ctx, s.coinbaseURL+"/products/"+url.PathEscape(a.coinbase)+"/stats", &row)
	price, _ := strconv.ParseFloat(row.Last, 64)
	open, _ := strconv.ParseFloat(row.Open, 64)
	high, _ := strconv.ParseFloat(row.High, 64)
	low, _ := strconv.ParseFloat(row.Low, 64)
	if !positive(high) {
		high = 0
	}
	if !positive(low) {
		low = 0
	}
	if err != nil || !positive(price) || !positive(open) {
		return Quote{}, fmt.Errorf("quote unavailable")
	}
	change := (price/open - 1) * 100
	if math.IsInf(change, 0) || math.IsNaN(change) {
		return Quote{}, fmt.Errorf("invalid change")
	}
	now := time.Now().UTC()
	// Public stats has no trade timestamp: AsOf is explicitly the fetch time.
	return Quote{Price: price, Change: &change, High: high, Low: low, Source: "Coinbase", AsOf: &now, ChartSource: "History unavailable"}, nil
}

func (s *Service) coinbaseHistory(ctx context.Context, a Asset) ([]float64, []int64, []Candle, error) {
	end := time.Now().UTC()
	start := end.Add(-7 * 24 * time.Hour)
	params := url.Values{"granularity": {"3600"}, "start": {start.Format(time.RFC3339)}, "end": {end.Format(time.RFC3339)}}
	var rows [][]float64
	if err := s.get(ctx, s.coinbaseURL+"/products/"+url.PathEscape(a.coinbase)+"/candles?"+params.Encode(), &rows); err != nil {
		return nil, nil, nil, err
	}
	// The API returns newest first and may include candles before the requested start.
	// Preserve real timestamps and gaps instead of generating replacement prices.
	closeByTime := map[int64]float64{}
	candleByTime := map[int64]Candle{}
	for _, row := range rows {
		if len(row) < 6 || !positive(row[0]) || row[0] < float64(start.Unix()) || row[0] > float64(end.Unix()) || !positive(row[4]) {
			continue
		}
		stamp := int64(row[0])
		if float64(stamp) != row[0] {
			continue
		}
		if !positive(row[1]) || !positive(row[2]) || !positive(row[3]) || row[1] > math.Min(row[3], row[4]) || row[2] < math.Max(row[3], row[4]) || math.IsNaN(row[5]) || math.IsInf(row[5], 0) || row[5] < 0 {
			continue
		}
		closeByTime[stamp] = row[4]
		candleByTime[stamp] = Candle{Time: stamp, Low: row[1], High: row[2], Open: row[3], Close: row[4], Volume: row[5]}
	}
	times := make([]int64, 0, len(closeByTime))
	for stamp := range closeByTime {
		times = append(times, stamp)
	}
	sort.Slice(times, func(i, j int) bool { return times[i] < times[j] })
	if len(times) < 2 {
		return nil, nil, nil, fmt.Errorf("history unavailable")
	}
	values := make([]float64, len(times))
	candles := make([]Candle, len(times))
	for i, stamp := range times {
		values[i] = closeByTime[stamp]
		candles[i] = candleByTime[stamp]
	}
	return values, times, candles, nil
}
