# Metabot papercut demo services in detached tmux sessions, logs teed to ~/src/mb/logs.
#
#   make up         start Chris's papercuts server (:8766)
#   make stop       stop it (alias: down)
#   make restart    stop + up
#   make status     sessions and papercuts server health
#   make logs       tail -F the server log
#   make reset      drop Metabot papercuts from papercuts.sqlite3 after a backup to backups/ (clean demo)

LOG_DIR ?= $(HOME)/src/mb/logs
TMUX_BIN := /opt/homebrew/bin/tmux
SERVER  := papercuts-server
SERVER_PORT := 8766

# $(call start,<session>,<command>)
start = if $(TMUX_BIN) has-session -t $(1) 2>/dev/null; then echo "$(1): already running"; else \
	printf '\n===== %s started %s =====\n' $(1) "$$(date '+%F %T')" >> $(LOG_DIR)/$(1).log; \
	$(TMUX_BIN) new-session -d -s $(1) -c $(CURDIR) "mise exec -- $(2) 2>&1 | tee -a $(LOG_DIR)/$(1).log"; \
	echo "$(1): started, logging to $(LOG_DIR)/$(1).log"; fi

stop_session = if $(TMUX_BIN) has-session -t $(1) 2>/dev/null; then $(TMUX_BIN) kill-session -t $(1); \
	printf '===== %s stopped %s =====\n' $(1) "$$(date '+%F %T')" >> $(LOG_DIR)/$(1).log; echo "$(1): stopped"; \
	else echo "$(1): not running"; fi

.PHONY: up start stop down restart status logs reset

up start:
	@mkdir -p $(LOG_DIR)
	@$(call start,$(SERVER),python3 ../server.py --port $(SERVER_PORT) --db papercuts.sqlite3)

stop down:
	@$(call stop_session,$(SERVER))

restart: stop up

status:
	@for s in $(SERVER); do \
		if $(TMUX_BIN) has-session -t $$s 2>/dev/null; then echo "$$s: running"; else echo "$$s: not running"; fi; done
	@echo "papercuts server on :$(SERVER_PORT) -> $$(curl -s --max-time 2 'http://127.0.0.1:$(SERVER_PORT)/api/papercuts?q=metabot/&limit=500' | jq -er '[.papercuts[] | select(any(.fingerprints[]; startswith("metabot:")))] | "\(length) Metabot papercuts"' 2>/dev/null || echo down)"

logs:
	@tail -F $(LOG_DIR)/$(SERVER).log

# The server keeps running; reset-metabot.sql only deletes Metabot's rows, so the next finding shows up as a new card.
reset:
	@if [ -f papercuts.sqlite3 ]; then mkdir -p backups; b=backups/papercuts-$$(date +%Y%m%d-%H%M%S).sqlite3; \
		sqlite3 -cmd '.timeout 5000' papercuts.sqlite3 ".backup $$b" && echo "papercuts.sqlite3 backed up to $$b" && \
		sqlite3 papercuts.sqlite3 < reset-metabot.sql; fi
