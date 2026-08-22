GO ?= go
PORT ?= 5000

.PHONY: build run start test
build:
	$(GO) run . build
run:
	$(GO) run . --port $(PORT)
start:
	$(GO) run . --port $(PORT)
test:
	$(GO) run . test
