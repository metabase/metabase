# Papercut tracker demo services in detached tmux sessions, logs teed to ~/src/mb/logs.
#
#   make up         start the receiver (:8765), the triage watcher, Chris's papercuts server (:8766), the sender and the fixer
#   make stop       stop all five (alias: down)
#   make restart    stop + up
#   make status     sessions, receiver and papercuts server health, row counts
#   make logs       tail -F all logs
#   make reset      truncate pa_events and triage_groups, delete issues/*.md, drop Metabot papercuts from
#                   papercuts.sqlite3 after a backup to backups/ (clean demo)
#   make dashboard  create or update the Metabase dashboard, print its URL
#   make test       Metabot finding -> send.ts -> Chris's server -> triage issue, all on throwaway copies

LOG_DIR ?= $(HOME)/src/mb/logs
TMUX    := /opt/homebrew/bin/tmux
PSQL    := docker exec -i papercuts-pg psql -U papercuts papercuts
RECV    := papercuts-receiver
TRIAGE  := papercuts-triage
SERVER  := papercuts-server
SENDER  := papercuts-sender
FIXER   := papercuts-fixer
SERVER_PORT := 8766
# Only the demo's papercut gets fixed automatically. Add --push to open a real draft PR on a /pr comment.
FIXER_ARGS ?= --match 'silent failure in search'

# $(call start,<session>,<command>)
start = if $(TMUX) has-session -t $(1) 2>/dev/null; then echo "$(1): already running"; else \
	printf '\n===== %s started %s =====\n' $(1) "$$(date '+%F %T')" >> $(LOG_DIR)/$(1).log; \
	$(TMUX) new-session -d -s $(1) -c $(CURDIR) "mise exec -- $(2) 2>&1 | tee -a $(LOG_DIR)/$(1).log"; \
	echo "$(1): started, logging to $(LOG_DIR)/$(1).log"; fi

stop_session = if $(TMUX) has-session -t $(1) 2>/dev/null; then $(TMUX) kill-session -t $(1); \
	printf '===== %s stopped %s =====\n' $(1) "$$(date '+%F %T')" >> $(LOG_DIR)/$(1).log; echo "$(1): stopped"; \
	else echo "$(1): not running"; fi

start_triage = if [ -f triage.ts ]; then $(call start,$(TRIAGE),bun triage.ts --watch); \
	else echo "$(TRIAGE): triage.ts not there yet, skipped"; fi

.PHONY: up start stop down restart status logs reset dashboard test

up start:
	@mkdir -p $(LOG_DIR)
	@$(call start,$(RECV),bun receiver.ts)
	@$(start_triage)
	@$(call start,$(SERVER),python3 ../server.py --port $(SERVER_PORT) --db papercuts.sqlite3)
	@$(call start,$(SENDER),bun send.ts --watch)
	@$(call start,$(FIXER),bun fixer.ts $(FIXER_ARGS))

stop down:
	@$(call stop_session,$(FIXER))
	@$(call stop_session,$(SENDER))
	@$(call stop_session,$(SERVER))
	@$(call stop_session,$(TRIAGE))
	@$(call stop_session,$(RECV))

restart: stop up

status:
	@for s in $(RECV) $(TRIAGE) $(SERVER) $(SENDER) $(FIXER); do \
		if $(TMUX) has-session -t $$s 2>/dev/null; then echo "$$s: running"; else echo "$$s: not running"; fi; done
	@echo "receiver on :8765 -> HTTP $$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:8765/health)"
	@echo "papercuts server on :$(SERVER_PORT) -> $$(curl -s --max-time 2 'http://127.0.0.1:$(SERVER_PORT)/api/papercuts?q=metabot/&limit=500' | jq -er '[.papercuts[] | select(any(.fingerprints[]; startswith("metabot:")))] | "\(length) Metabot papercuts"' 2>/dev/null || echo down)"
	@$(PSQL) -c "select (select count(*) from pa_events) pa_events, (select count(*) from triage_groups) triage_groups"
	@echo "issues/*.md: $$(ls issues/*.md 2>/dev/null | wc -l | tr -d ' ')"

logs:
	@tail -F $(LOG_DIR)/$(RECV).log $(LOG_DIR)/$(TRIAGE).log $(LOG_DIR)/$(SENDER).log $(LOG_DIR)/$(FIXER).log

# The watcher is restarted so it drops any in-memory state about the rows it saw. The papercuts server keeps running;
# reset-metabot.sql only deletes andreis.metabot's rows, so the next Metabot finding shows up as a new card.
reset:
	@$(PSQL) -qc "truncate pa_events, triage_groups"
	@rm -f issues/*.md
	@echo "pa_events and triage_groups truncated, issues/*.md deleted"
	@if [ -f papercuts.sqlite3 ]; then mkdir -p backups; b=backups/papercuts-$$(date +%Y%m%d-%H%M%S).sqlite3; \
		sqlite3 -cmd '.timeout 5000' papercuts.sqlite3 ".backup $$b" && echo "papercuts.sqlite3 backed up to $$b" && \
		sqlite3 papercuts.sqlite3 < reset-metabot.sql; fi
	@if $(TMUX) has-session -t $(TRIAGE) 2>/dev/null; then $(call stop_session,$(TRIAGE)); $(start_triage); fi

dashboard:
	@mise exec -- bun dashboard/setup.ts

# Metabot path end to end on throwaway copies: scratch database, send.ts, Chris's server on a free port, triage.
test:
	@mise exec -- python3 -B -m unittest -v test_metabot_path
