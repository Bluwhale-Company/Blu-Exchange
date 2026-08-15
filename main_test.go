package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func launcherProject(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module github.com/Bluwhale-Company/Blu-Exchange\n"), 0644); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestStartBuildsThenForwardsArguments(t *testing.T) {
	root := launcherProject(t)
	directory := filepath.Join(root, "nested", "directory")
	if err := os.MkdirAll(directory, 0755); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(root, "bin", "exchange")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	flags := []string{"-addr", ":9000", "-offline"}
	var calls [][]string
	invoke := func(_ context.Context, dir, name string, args ...string) error {
		if dir != root {
			t.Errorf("child directory = %s, want project root %s", dir, root)
		}
		calls = append(calls, append([]string{name}, args...))
		return nil
	}
	var output bytes.Buffer
	if err := run(context.Background(), append([]string{"start"}, flags...), directory, &output, invoke); err != nil {
		t.Fatal(err)
	}
	want := [][]string{{"go", "build", "-o", binary, "./cmd/exchange"}, append([]string{binary}, flags...)}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("commands = %#v, want %#v", calls, want)
	}
}

func TestBuildFailurePreventsStart(t *testing.T) {
	buildError := errors.New("compiler failed")
	calls := 0
	err := run(context.Background(), nil, launcherProject(t), io.Discard, func(context.Context, string, string, ...string) error {
		calls++
		return buildError
	})
	if !errors.Is(err, buildError) || calls != 1 {
		t.Fatalf("failed build must prevent startup: calls=%d, error=%v", calls, err)
	}
}

func TestTestCommandPreservesFailure(t *testing.T) {
	failure := errors.New("tests failed")
	err := run(context.Background(), []string{"test", "-v", "-run", "TestMarket"}, launcherProject(t), io.Discard, func(_ context.Context, _, name string, args ...string) error {
		if name != "go" || !reflect.DeepEqual(args, []string{"test", "./...", "-v", "-run", "TestMarket"}) {
			t.Fatalf("incorrect test invocation: %s %v", name, args)
		}
		return failure
	})
	if !errors.Is(err, failure) {
		t.Fatalf("test failure was lost: %v", err)
	}
}

func TestHelpWithoutProject(t *testing.T) {
	for _, args := range [][]string{{"help"}, {"-h"}, {"--help"}} {
		var output bytes.Buffer
		err := run(context.Background(), args, t.TempDir(), &output, func(context.Context, string, string, ...string) error {
			t.Fatal("help must not launch a process")
			return nil
		})
		if err != nil || !bytes.Contains(output.Bytes(), []byte("Blu-Exchange")) {
			t.Fatalf("help failed: %v", err)
		}
	}
}
