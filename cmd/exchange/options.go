package main

import (
	"flag"
	"fmt"
	"io"
	"net"
	"strconv"
)

type serverOptions struct {
	Addr    string
	Offline bool
}

func parseServerOptions(args []string, environmentPort string, out io.Writer) (serverOptions, error) {
	var options serverOptions
	flags := flag.NewFlagSet("Blu-Exchange", flag.ContinueOnError)
	flags.SetOutput(out)
	port := flags.String("port", "", "HTTP port (1-65535; defaults to PORT or 5000)")
	addr := flags.String("addr", "", "HTTP host:port, for example 127.0.0.1:9000 (alternative to --port)")
	flags.BoolVar(&options.Offline, "offline", false, "Use sample data without contacting market providers")
	if err := flags.Parse(args); err != nil {
		return options, err
	}
	if flags.NArg() != 0 {
		return options, fmt.Errorf("unexpected arguments; use --help for server options")
	}
	var hasPort, hasAddr bool
	flags.Visit(func(f *flag.Flag) {
		hasPort = hasPort || f.Name == "port"
		hasAddr = hasAddr || f.Name == "addr"
	})
	if hasPort && hasAddr {
		return options, fmt.Errorf("use either --port or --addr, not both")
	}
	host := ""
	value := environmentPort
	if value == "" {
		value = "5000"
	}
	if hasPort {
		value = *port
	}
	if hasAddr {
		var err error
		host, value, err = net.SplitHostPort(*addr)
		if err != nil {
			return options, fmt.Errorf("--addr must be a host:port, for example 127.0.0.1:9000")
		}
	}
	number, err := strconv.Atoi(value)
	if err != nil || number < 1 || number > 65535 {
		return options, fmt.Errorf("port must be a number between 1 and 65535")
	}
	options.Addr = net.JoinHostPort(host, strconv.Itoa(number))
	return options, nil
}
