GO ?= go

.PHONY: build run start test
build:
	$(GO) run . build
run:
	$(GO) run . run
start:
	$(GO) run . start
test:
	$(GO) run . test
