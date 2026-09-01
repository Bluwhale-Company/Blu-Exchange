// Package market keeps public market quotes in memory. It never stores user data.
package market

import (
	"context"
	"math"
	"net/http"
	"sync"
	"time"
)

type Asset struct {
	ID          string `json:"id"`
	Symbol      string `json:"symbol"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Region      string `json:"region"`
	Country     string `json:"country"`
	Venue       string `json:"venue"`
	Color       string `json:"color"`
	Mark        string `json:"mark"`
	Description string `json:"description"`
	Quote       Quote  `json:"quote"`
	coinbase    string
}
type Candle struct {
	Time   int64   `json:"time"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}
type Quote struct {
	Candles        []Candle   `json:"candles,omitempty"`
	Price          float64    `json:"price"`
	Change         *float64   `json:"change"`
	High           float64    `json:"high"`
	Low            float64    `json:"low"`
	Volume         float64    `json:"volume"`
	MarketCap      float64    `json:"marketCap"`
	Source         string     `json:"source"`
	Status         string     `json:"status"`
	AsOf           *time.Time `json:"asOf,omitempty"`
	RetrievedAt    *time.Time `json:"retrievedAt,omitempty"`
	Chart          []float64  `json:"chart"`
	ChartTimes     []int64    `json:"chartTimes,omitempty"`
	ChartUpdatedAt *time.Time `json:"chartUpdatedAt,omitempty"`
	ChartSource    string     `json:"chartSource"`
	Note           string     `json:"note,omitempty"`
	failed         bool
}
type Feed struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}
type Snapshot struct {
	Assets         []Asset    `json:"assets"`
	Feeds          []Feed     `json:"feeds"`
	UpdatedAt      *time.Time `json:"updatedAt,omitempty"`
	RefreshSeconds int        `json:"refreshSeconds"`
}
type Options struct {
	Client  *http.Client
	Offline bool
}

const RefreshInterval = 30 * time.Second
const historyInterval = 15 * time.Minute

type Service struct {
	mu          sync.RWMutex
	refreshMu   sync.Mutex
	quotes      map[string]Quote
	feeds       []Feed
	updatedAt   *time.Time
	opts        Options
	coinbaseURL string
	interval    time.Duration
	nextHistory time.Time
}

func New(opts Options) *Service {
	if opts.Client == nil {
		opts.Client = &http.Client{Timeout: 7 * time.Second}
	}
	s := &Service{opts: opts, quotes: make(map[string]Quote), coinbaseURL: "https://api.exchange.coinbase.com", interval: RefreshInterval}
	s.feeds = []Feed{{"Coinbase", "connecting"}}
	if opts.Offline {
		for i := range s.feeds {
			s.feeds[i].Status = "offline"
		}
	}
	for i, a := range catalog {
		change := sampleChanges[i]
		series := make([]float64, 168)
		for j := range series {
			x := float64(j) / 167
			series[j] = samplePrices[i] * (1 + (x-1)*change/100 + (math.Sin(float64(j)*0.43+float64(i))+math.Sin(float64(j)*0.13))*0.003)
		}
		candles := make([]Candle, len(series))
		for j, close := range series {
			open := close
			if j > 0 {
				open = series[j-1]
			}
			wick := close * (0.0005 + math.Abs(math.Sin(float64(j)*1.7))*0.0015)
			candles[j] = Candle{Open: open, Close: close, High: math.Max(open, close) + wick, Low: math.Min(open, close) - wick, Volume: (12 + math.Abs(math.Sin(float64(j)*2.3))*90) * (1 + math.Abs(close-open)/close*1000)}
		}
		note := "Connecting to Coinbase. Showing an illustrative sample."
		if a.coinbase == "" {
			note = "This asset has no supported Coinbase USD pair. Showing an illustrative sample."
		}
		if a.Kind == "stock" {
			note = "Stock quotes are unavailable from this Coinbase crypto feed. Showing an illustrative sample."
		}
		if opts.Offline {
			note = "Offline preview. This is an illustrative sample."
		}
		s.quotes[a.ID] = Quote{Price: samplePrices[i], Change: &change, High: samplePrices[i] * 1.025, Low: samplePrices[i] * 0.975, Source: "Sample", Status: "sample", Chart: series, Candles: candles, ChartSource: "Illustrative", Note: note}
	}
	return s
}
func (s *Service) Snapshot() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := Snapshot{Assets: make([]Asset, len(catalog)), Feeds: append([]Feed(nil), s.feeds...), RefreshSeconds: int(s.interval.Seconds())}
	if s.updatedAt != nil {
		stamp := *s.updatedAt
		out.UpdatedAt = &stamp
	}
	for i, a := range catalog {
		q := s.quotes[a.ID]
		q.Candles = append([]Candle(nil), q.Candles...)
		q.Chart = append([]float64(nil), q.Chart...)
		q.ChartTimes = append([]int64(nil), q.ChartTimes...)
		if q.ChartUpdatedAt != nil {
			stamp := *q.ChartUpdatedAt
			q.ChartUpdatedAt = &stamp
		}
		if q.Change != nil {
			value := *q.Change
			q.Change = &value
		}
		if q.AsOf != nil {
			stamp := *q.AsOf
			q.AsOf = &stamp
		}
		if q.RetrievedAt != nil {
			stamp := *q.RetrievedAt
			q.RetrievedAt = &stamp
		}
		if q.Source != "Sample" {
			q.Status = "live"
			if q.failed || q.RetrievedAt == nil || time.Since(*q.RetrievedAt) > s.interval*3 {
				q.Status = "stale"
			} else if q.AsOf == nil || time.Since(*q.AsOf) > 5*time.Minute {
				q.Status = "delayed"
				if a.Kind == "crypto" {
					q.Status = "stale"
				}
			}
		}
		a.Quote = q
		out.Assets[i] = a
	}
	return out
}
func (s *Service) Run(ctx context.Context) {
	if s.opts.Offline {
		return
	}
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	s.Refresh(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.Refresh(ctx)
		}
	}
}
func (s *Service) Refresh(ctx context.Context) {
	if s.opts.Offline {
		return
	}
	// One shared refresh bounds upstream traffic independently of visitor count.
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	// Bound a refresh so an unavailable upstream cannot overlap the next cycle.
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	s.refreshCrypto(ctx)
	now := time.Now().UTC()
	s.mu.Lock()
	s.updatedAt = &now
	s.mu.Unlock()
}
func (s *Service) feed(name, status string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.feeds {
		if s.feeds[i].Name == name {
			s.feeds[i].Status = status
		}
	}
}
func (s *Service) put(id string, q Quote) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	q.RetrievedAt = &now
	previous := s.quotes[id]
	if previous.Source == "Coinbase" {
		q.Candles = previous.Candles
		q.Chart = previous.Chart
		q.ChartTimes = previous.ChartTimes
		q.ChartSource = previous.ChartSource
		q.ChartUpdatedAt = previous.ChartUpdatedAt
	}
	s.quotes[id] = q
}
func (s *Service) failed(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	q := s.quotes[id]
	q.failed = true
	if q.Source == "Sample" {
		q.Note = "Coinbase quote unavailable. Showing an illustrative sample."
	}
	s.quotes[id] = q
}
func Find(id string) (Asset, bool) {
	for _, a := range catalog {
		if a.ID == id {
			return a, true
		}
	}
	return Asset{}, false
}
func positive(v float64) bool { return v > 0 && !math.IsInf(v, 0) && !math.IsNaN(v) }
