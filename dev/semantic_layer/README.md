# Semantic-layer harness

A throwaway loop for iterating on an LLM-generated semantic layer in Metabase:
**nuke everything → regenerate → load → look at it (internal tooling + normal routes) → change Metabase → repeat.**
No diffs, no migrations of content. Every run starts from a pristine instance.

## What runs where

One backend, one frontend watcher, one warehouse:

| thing | where |
|---|---|
| Metabase backend | `server.py`, **port 3000**, EE, hot reload, nREPL 50606 (`./bin/mage -repl` picks it up from `.nrepl-port`) |
| app DB | Postgres `mb_semantic_layer`, cloned from `mb_semantic_layer_clean` on every reset; the viz-ab / overview judgement tables are dumped and restored around the clone |
| frontend bundle | `make watch` (rspack hot bundle on 8080, cljs, static-viz) writes `resources/frontend_client/app/dist`; the backend serves it |
| warehouse | Postgres `semantic_layer_test` (one schema per source DB), rebuilt by `build_warehouse.py` |

`make dev` = backend up (no-op if running) + watcher in the foreground; the `metabase-dev` launch config runs exactly
that, so `preview_start metabase-dev` is the whole dev environment. The backend is detached from the watcher, so
`make reset` / `layer-fresh` bounce the backend while the watcher keeps running; stop the backend with `make down`.

The inner loop this supports: see something wrong in the frontend → decide whether it is a semantic-layer, generator
or viz-heuristic problem → if semantic layer, edit `layers/<schema>/` and `make layer-fresh` → back to the frontend.

## One-time setup

```bash
make -C dev/semantic_layer bootstrap
```

Creates the app DB, boots the backend, runs the setup wizard, mints an admin API key and stores it as `mb` profile
`semlayer`, adds the warehouse and waits for sync, then snapshots the app DB as the template. Re-run to change the
template (e.g. after adding a migration or a new source DB). Admin login is in `common.py` (`ADMIN`).

Prereqs: `~/.config/metabase/dev.env` (EE token), Postgres.app on 5432 with your OS user, `mb` CLI on PATH
(`npm i -g @metabase/cli`), `psycopg` for the warehouse script.

## The loop

```bash
make -C dev/semantic_layer layer-fresh SCHEMA=pagila   # reset warehouse + app DB, restart, load layers/pagila
make -C dev/semantic_layer layer SCHEMA=pagila         # load again without resetting (upserts / duplicates — you asked for it)
make -C dev/semantic_layer reset-app                   # just wipe the instance (keeps warehouse; skip if transforms ran)
make -C dev/semantic_layer restart                     # after backend changes hot reload can't handle
```

Instance: http://localhost:3000 · `mb ... --profile semlayer` · REPL: `./bin/mage -repl`.

## Layers

`layers/<schema>/build.sh` **is** the layer: a replayable script of `mb` calls, with the SQL and JSON bodies alongside.
`layers/pagila/` is the reference (4 transforms → published tables with metadata → 15 measures, 6 segments → 5 Library
metrics → 11 questions → 1 dashboard, ~60s, deterministic ids on every replay). Bodies are templates; `build.sh`'s
`render` fills `{{t:…}}` / `{{f:…}}` / `{{card:…}}` tokens from the ids the instance hands out. Optional
`layers/<schema>/layer.json` (the agent's intent) is stored verbatim in the dev prototype store
(`/api/dev/prototype/semantic-layer/`). `layers/_example/build.sh` is the bare phase-order skeleton.

The approach is captured as the project skill `.claude/skills/build-semantic-layer/` — start there for a new schema.

## Files

- `common.py` — config block (ports, DB names, profile, admin creds) + helpers
- `server.py` — start/stop/status/logs of this harness's backend (pidfile + log under `.scratch/`)
- `bootstrap.py` — builds the template (above)
- `reset.py` — warehouse rebuild + app DB clone (judgement tables preserved) + restart
- `load.py` — runs a layer's `build.sh`, pushes `layer.json`
- `build_warehouse.py` — `semantic_layer_test` from grammargrind/chinook/pagila/lego
- `.scratch/` — gitignored: server log, pid, `state.json` (API key, warehouse db id)
