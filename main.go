// Blu-Exchange's project launcher. Run "go run . help" for available commands.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

const usage = `Blu-Exchange

Usage: go run . [command] [options]
       go run main.go [command] [options]

  start    Build and start the server (default when no command is given)
  build    Build bin/exchange (bin/exchange.exe on Windows)
  test     Run Go and UI tests (requires Node.js 20+)
  help     Show this help

Examples:
  go run .
  go run . --port 9000
  go run . start
  go run . test
  go run . --offline
  go run . build

Start options: --port 5000, --addr 127.0.0.1:5000, --offline
Port precedence: --port or --addr, then PORT, then 5000.
Additional test flags are forwarded to Go tests, e.g. test -v.

No database, API key, or .env file is required.
Coinbase public crypto quotes refresh every 30 seconds. Press Ctrl+C to stop.
`

type commandRunner func(context.Context, string, string, ...string) error

func main() {
	os.Exit(mainCode())
}

func mainCode() int {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	directory, err := os.Getwd()
	if err == nil {
		err = run(ctx, os.Args[1:], directory, os.Stdout, execute)
	}
	if err == nil {
		return 0
	}
	if ctx.Err() != nil {
		return 130
	}
	fmt.Fprintln(os.Stderr, "Blu-Exchange:", err)
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) && exitErr.ExitCode() > 0 {
		return exitErr.ExitCode()
	}
	return 1
}

func run(ctx context.Context, args []string, directory string, out io.Writer, invoke commandRunner) error {
	command := "start"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		command, args = args[0], args[1:]
	} else if len(args) > 0 && (args[0] == "-h" || args[0] == "--help") {
		command = "help"
	}
	if command == "help" {
		_, err := io.WriteString(out, usage)
		return err
	}
	switch command {
	case "start", "build", "test":
	case "run":
		return fmt.Errorf("the redundant run command was removed; use 'go run .' to start")
	default:
		return fmt.Errorf("unknown command %q; use 'go run . help'", command)
	}
	root, err := projectRoot(directory)
	if err != nil {
		return err
	}
	if command == "test" {
		fmt.Fprintln(out, "Running Go tests...")
		if err := invoke(ctx, root, "go", append([]string{"test", "./..."}, args...)...); err != nil {
			return err
		}
		fmt.Fprintln(out, "Running UI tests...")
		return invoke(ctx, root, "node", "--test", "tests/frontend.test.mjs")
	}
	if command == "build" && len(args) != 0 {
		return fmt.Errorf("build takes no arguments; use 'go run . help'")
	}
	binary := filepath.Join(root, "bin", "exchange")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	if err := os.MkdirAll(filepath.Dir(binary), 0755); err != nil {
		return err
	}
	fmt.Fprintln(out, "Building Blu-Exchange...")
	if err := invoke(ctx, root, "go", "build", "-o", binary, "./cmd/exchange"); err != nil {
		return fmt.Errorf("build failed: %w", err)
	}
	if command == "build" {
		fmt.Fprintln(out, "Built", binary)
		return nil
	}
	fmt.Fprintln(out, "Starting Blu-Exchange (Ctrl+C to stop)...")
	return invoke(ctx, root, binary, args...)
}

func execute(ctx context.Context, directory, name string, args ...string) error {
	// Launch directly so flags, paths, and credentials never pass through a shell.
	command := exec.CommandContext(ctx, name, args...)
	command.Dir = directory
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	return command.Run()
}

func projectRoot(directory string) (string, error) {
	for {
		data, err := os.ReadFile(filepath.Join(directory, "go.mod"))
		if err == nil {
			fields := strings.Fields(string(data))
			if len(fields) >= 2 && fields[0] == "module" && fields[1] == "github.com/Bluwhale-Company/Blu-Exchange" {
				return directory, nil
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return "", fmt.Errorf("run this command from the Blu-Exchange project directory")
		}
		directory = parent
	}
}
