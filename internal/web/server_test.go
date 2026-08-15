package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Bluwhale-Company/Blu-Exchange/internal/market"
)

func TestReadOnlyRoutes(t *testing.T) {
	handler, err := New(market.New(market.Options{Offline: true}))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/", "/markets", "/watchlist", "/trade/bluai", "/trade/nvda", "/portfolio", "/orders", "/user/account", "/user/wallet"} {
		r := httptest.NewRecorder()
		handler.ServeHTTP(r, httptest.NewRequest("GET", path, nil))
		if r.Code != 200 || !strings.Contains(r.Body.String(), "Blu-Exchange") || !strings.Contains(r.Header().Get("Content-Type"), "text/html") {
			t.Errorf("%s: %d", path, r.Code)
		}
		if r.Header().Get("Set-Cookie") != "" {
			t.Errorf("%s created a cookie", path)
		}
	}
	for _, path := range []string{"/user/signup", "/user/login", "/trade/unknown", "/api/unknown", "/missing"} {
		r := httptest.NewRecorder()
		handler.ServeHTTP(r, httptest.NewRequest("GET", path, nil))
		if r.Code != 404 {
			t.Errorf("%s: got %d, want 404", path, r.Code)
		}
	}
	for _, method := range []string{"POST", "PUT", "PATCH", "DELETE"} {
		for _, path := range []string{"/api/markets", "/user/signup", "/orders", "/trade/bitcoin"} {
			r := httptest.NewRecorder()
			handler.ServeHTTP(r, httptest.NewRequest(method, path, strings.NewReader("{}")))
			if r.Code != 405 {
				t.Errorf("%s %s: got %d, want 405", method, path, r.Code)
			}
		}
	}
}
func TestEmbeddedAssetsAndSnapshot(t *testing.T) {
	handler, err := New(market.New(market.Options{Offline: true}))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/static/css/main.css", "/static/js/app.mjs", "/static/js/core.mjs", "/static/images/brand.svg", "/ping"} {
		r := httptest.NewRecorder()
		handler.ServeHTTP(r, httptest.NewRequest("GET", path, nil))
		if r.Code != 200 || r.Body.Len() == 0 {
			t.Errorf("missing embedded asset %s", path)
		}
		if strings.HasSuffix(path, ".mjs") && !strings.Contains(r.Header().Get("Content-Type"), "javascript") {
			t.Errorf("module content type: %s", r.Header().Get("Content-Type"))
		}
	}
	r := httptest.NewRecorder()
	handler.ServeHTTP(r, httptest.NewRequest(http.MethodGet, "/api/markets", nil))
	if r.Header().Get("Cache-Control") != "no-store" || r.Header().Get("Content-Security-Policy") == "" {
		t.Fatal("missing response headers")
	}
	var result market.Snapshot
	if err := json.Unmarshal(r.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Assets) != 19 {
		t.Fatalf("asset count: %d", len(result.Assets))
	}
	if result.RefreshSeconds != 30 || len(result.Feeds) != 1 || result.Feeds[0].Name != "Coinbase" {
		t.Fatalf("incorrect public feed or refresh interval: %+v", result.Feeds)
	}
}
