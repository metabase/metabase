# Metabot papercuts

Metabot reports its own papercuts to the papercuts server one directory up. Metabase already sends an `ai_service_event.agent_used_tool` Track event for every tool call, and a review of each finished turn adds `ai_service_event.agent_turn_reviewed`, which also catches failures the tool event records as a success, such as a search error returned as normal output. The turn review, the `error_class` and `agent_error` fields on the tool event, and the `metabot-demo-break-search` switch are uncommitted changes in the demo checkout, not on this branch.

- `receiver.ts` stands in for Track and stores every event in Postgres (`schema.sql`). Metabase sends it events when started with `MB_METAPLOW_URL=http://localhost:8765/api/send`.
- `triage.ts` has an LLM check each group of findings and writes an issue for the genuine ones, see below.
- `send.ts` posts each finding to `../server.py` as a report with a `metabot:` fingerprint.
- `fixer.ts` has headless Claude Code fix new Metabot papercuts in a throwaway worktree, and opens a draft PR when someone comments `/pr` on the papercut. Without `--push` that step is a dry run.
- `dashboard/setup.ts` builds a Metabase dashboard over the events. `dashboard/stats-queries.sql` has the same cards for ClickHouse on stats, never run.
- `demo/break.sh <throw|swallow|empty|off>` breaks the search tool, `demo/chat.sh "<question>"` asks Metabot a question, and `bin/nrepl-eval` evaluates Clojure in the running dev server.

`make up` starts the receiver, triage, the server on :8766, the sender and the fixer in tmux. `make test` runs a synthetic finding through `send.ts`, the server and triage on throwaway copies. Both need Postgres in a container named `papercuts-pg`, and `make up` needs `schema.sql` loaded:

```sh
docker run -d --name papercuts-pg -p 127.0.0.1:5433:5432 -e POSTGRES_USER=papercuts -e POSTGRES_PASSWORD=papercuts postgres:17-alpine
docker exec -i papercuts-pg psql -U papercuts papercuts < schema.sql
```

Settings go in `.env` in this directory: `MB_API_KEY` for the local Metabase, `PAPERCUTS_SERVER` and `PAPERCUTS_TOKEN` for the server, and the triage LLM below. `METABASE_REPO` and `METABASE_LOG` in the environment default to `~/src/mb/metabase` and `~/src/mb/logs/dev-ee.log`, and `fixer.ts` runs the Claude desktop app's CLI unless `CLAUDE_BIN` is set.

## Triage

`triage.ts` groups papercut findings from `pa_events` into `triage_groups`, has an LLM check each new group against `dev-ee.log`, the conversation and the Metabot source, and writes `issues/<fingerprint>.md` for the genuine ones.

```sh
mise exec -- bun triage.ts                 # one pass
mise exec -- bun triage.ts --watch         # poll every 10 s, this is what `make up` runs
mise exec -- bun triage.ts --file linear   # also file triaged groups to Linear, needs LINEAR_API_KEY
```

## Switching the LLM

Put the settings in `.env`. Triage reads them on every call, so the next triage picks them up without a restart.

- **DeepSeek** is the default when nothing is set: `deepseek-chat` at `https://api.deepseek.com`, with the key from `LLM_API_KEY`, else `DEEPSEEK_TESTING_API_KEY` from `~/src/mb/docs/.env`.
- **Anthropic API**: `ANTHROPIC_API_KEY=sk-ant-...`. It wins whenever it is set. `ANTHROPIC_MODEL` overrides the default `claude-opus-5`.
- **Any other OpenAI-compatible API**, such as OpenRouter: `LLM_BASE_URL=https://openrouter.ai/api/v1`, `LLM_API_KEY=sk-or-...`, `LLM_MODEL=anthropic/claude-opus-5`. A custom `LLM_BASE_URL` never gets the DeepSeek key.

Every backend returns the verdict through a forced tool call. Removing a key from `.env` only takes effect after `make restart`, because Bun also loads `.env` into the process environment at startup.
