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
	if err := initializeStartup(); err != nil {
		log.Fatal(err)
	}
	options, err := parseServerOptions(os.Args[1:], os.Getenv("PORT"), os.Stdout)
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	if err != nil {
		log.Fatal(err)
	}
	service := market.New(market.Options{Offline: options.Offline})
	handler, err := web.New(service)
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go service.Run(ctx)
	server := &http.Server{Addr: options.Addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			log.Print("Shutdown: ", err)
		}
	}()
	log.Printf("Blu-Exchange listening on %s | database-free market preview", options.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
