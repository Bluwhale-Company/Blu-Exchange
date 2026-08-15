package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Bluwhale-Company/Blu-Exchange/internal/market"
	"github.com/Bluwhale-Company/Blu-Exchange/internal/web"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := flag.String("addr", ":"+port, "HTTP listen address")
	offline := flag.Bool("offline", false, "Use labeled sample data without contacting market providers")
	flag.Parse()
	if flag.NArg() != 0 {
		log.Fatal("unexpected arguments; use -h for server options")
	}
	service := market.New(market.Options{Offline: *offline})
	handler, err := web.New(service)
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go service.Run(ctx)
	server := &http.Server{Addr: *addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			log.Print("Shutdown: ", err)
		}
	}()
	log.Printf("Blu-Exchange listening on %s | database-free market preview", *addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
