package web

import (
	"encoding/json"
	"github.com/Bluwhale-Company/Blu-Exchange/internal/market"
	"github.com/Bluwhale-Company/Blu-Exchange/ui"
	"io/fs"
	"net/http"
	"strings"
)

func New(service *market.Service) (http.Handler, error) {
	shell, err := ui.Files.ReadFile("static/index.html")
	if err != nil {
		return nil, err
	}
	static, err := fs.Sub(ui.Files, "static")
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write([]byte("OK\n"))
	})
	mux.HandleFunc("GET /api/markets", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(service.Snapshot())
	})
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(static)))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		allowed := false
		switch r.URL.Path {
		case "/", "/markets", "/watchlist", "/portfolio", "/orders", "/user/wallet", "/user/account":
			allowed = true
		default:
			if id, ok := strings.CutPrefix(r.URL.Path, "/trade/"); ok {
				_, allowed = market.Find(id)
			}
		}
		if !allowed {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(shell)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
		mux.ServeHTTP(w, r)
	}), nil
}
