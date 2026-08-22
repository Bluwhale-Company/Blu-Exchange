package main

import (
	"errors"
	"flag"
	"io"
	"testing"
)

func TestServerPortSelection(t *testing.T) {
	for _, tc := range []struct {
		name string
		args []string
		env  string
		want string
	}{
		{"default", nil, "", ":5000"},
		{"environment", nil, "10000", ":10000"},
		{"custom port", []string{"--port", "9000"}, "", ":9000"},
		{"equals syntax", []string{"--port=9000"}, "", ":9000"},
		{"flag overrides environment", []string{"--port", "9000"}, "10000", ":9000"},
		{"flag overrides invalid environment", []string{"--port", "9000"}, "invalid", ":9000"},
		{"specific interface", []string{"--addr", "127.0.0.1:9090"}, "10000", "127.0.0.1:9090"},
		{"IPv6 interface", []string{"--addr", "[::1]:9090"}, "", "[::1]:9090"},
		{"maximum port", []string{"--port", "65535"}, "", ":65535"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			options, err := parseServerOptions(tc.args, tc.env, io.Discard)
			if err != nil || options.Addr != tc.want {
				t.Fatalf("address = %q, error = %v; want %q", options.Addr, err, tc.want)
			}
		})
	}
}

func TestInvalidServerOptions(t *testing.T) {
	for _, args := range [][]string{
		{"--port", "0"}, {"--port", "-1"}, {"--port", "65536"},
		{"--port", "abc"}, {"--port="}, {"--port"},
		{"--port", "9000", "--addr", ":9001"},
		{"--addr", "localhost"}, {"--addr", ":abc"}, {"--addr="},
		{"--unknown"}, {"extra"},
	} {
		if _, err := parseServerOptions(args, "", io.Discard); err == nil {
			t.Errorf("accepted invalid options %v", args)
		}
	}
	if _, err := parseServerOptions(nil, "invalid", io.Discard); err == nil {
		t.Error("accepted invalid PORT environment value")
	}
}

func TestOfflineAndHelpOptions(t *testing.T) {
	options, err := parseServerOptions([]string{"--port", "9000", "--offline"}, "", io.Discard)
	if err != nil || !options.Offline {
		t.Fatalf("offline custom-port preview failed: %v", err)
	}
	if _, err := parseServerOptions([]string{"--help"}, "", io.Discard); !errors.Is(err, flag.ErrHelp) {
		t.Fatalf("help error = %v", err)
	}
}
