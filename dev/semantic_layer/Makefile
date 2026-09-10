# Semantic-layer harness. All targets run from anywhere: `make -C dev/semantic_layer <target>`.
PY := python3
REPO := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/../..)
SCHEMA ?= pagila

.PHONY: help dev watch bootstrap reset reset-app up down restart status logs warehouse layer layer-fresh

help:
	@echo "dev            backend up (if needed) + frontend watcher in the foreground   (the metabase-dev launch config)"
	@echo "watch          frontend watcher only (rspack hot bundle, cljs, static-viz)"
	@echo "bootstrap      one-time: build the pristine app-DB template (re-run to change it)"
	@echo "reset          nuke warehouse + app DB, restart instance"
	@echo "reset-app      nuke app DB only (keeps warehouse), restart instance"
	@echo "up/down/restart/status/logs   control the backend (port 3000)"
	@echo "warehouse      rebuild semantic_layer_test from the source DBs"
	@echo "layer          load layers/\$$(SCHEMA)/build.sh into the running instance   (SCHEMA=$(SCHEMA))"
	@echo "layer-fresh    reset, then layer"

bootstrap: ; $(PY) bootstrap.py
reset:     ; $(PY) reset.py
reset-app: ; $(PY) reset.py --keep-warehouse
dev:       ; $(PY) server.py start && $(MAKE) watch
watch:     ; cd $(REPO) && bun run clean-dev:cljs && bun run concurrently -n 'frontend,cljs,static-viz' -c 'green,yellow,magenta' \
	     'MB_EDITION=ee bun run build-hot:js-wait' 'MB_EDITION=ee bun run build:cljs' 'bun run build-static-viz:watch-wait'
up:        ; $(PY) server.py start
down:      ; $(PY) server.py stop
restart:   ; $(PY) server.py restart
status:    ; $(PY) server.py status
logs:      ; $(PY) server.py logs
warehouse: ; $(PY) build_warehouse.py
layer:     ; $(PY) load.py $(SCHEMA)
layer-fresh: ; $(PY) load.py $(SCHEMA) --reset
