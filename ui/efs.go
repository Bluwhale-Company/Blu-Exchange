package ui

import "embed"

// Files contains the complete frontend, embedded in the Go executable.
//
//go:embed static
var Files embed.FS
