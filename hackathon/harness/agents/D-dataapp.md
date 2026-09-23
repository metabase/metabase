# Agent D — results store and Metabase data app

> **Status: DONE (build)** — confirmed by Agent F, 2026-09-23. **Reopened by Voytek** the same evening for the
> Headline tab (see worklog); D owns the Headline cards, G the rest. Handed over: dashboard defaults and
> publishing real results → Agent A. **Reopen trigger:** the first embedding-text variant run or arctic golden
> run, when the two currently empty cards (Δ vs baseline by category; keyword-engine sanity) should fill in.
> Worklog: `../worklogs/D-dataapp.md`. Runbook: *Bring the data app back after a restart*, at the end.

Read `_shared-context.md` first. Depends only on the schema in `01-contracts.md` §4, which is frozen
— so you can build against hand-inserted fixture rows before any real run exists. Do that.

You own: `hackathon/harness/results/` (TypeScript writer + fixtures — moved from
`dev/src/dev/harness/results.clj` after the TypeScript direction change), `hackathon/harness/sql/*.sql`,
`hackathon/harness/dashboard/*`.

## Mission

Persist results, and build the Metabase data app that presents them. This is the wow factor: we are
evaluating Metabase's search using Metabase.

## Deliverables

1. **Schema + migration script.** `01-contracts.md` §4 verbatim, as idempotent SQL.
   ```bash
   docker exec semantic_search-postgres-1 createdb -U postgres harness
   ```
   Reuse the running pgvector container; a separate `harness` database keeps results out of the thing
   being measured.

2. **Writer.** `start-run!`, `record-query-result!`, `record-metrics!`, `finish-run!`. Batched
   inserts. Never overwrite an existing run — a re-run gets a new `run_id`.

3. **Fixture generator.** Plausible fake rows for 3 engines × 2 embedders × 40 scenarios, so the
   dashboard can be built and demo-rehearsed before the real runner exists. **Build this first.**

4. **The data app.** Add the `harness` database to the local Metabase instance, then build:
   - *Headline*: latency p50/p95 by engine, split by embedder and scale tier
   - *Quality*: recall@10 and nDCG@10 by engine × embedder
   - **The slide that matters**: quality by scenario **tag** × engine — showing that different
     engines win different query categories
   - **The slide nobody expects**: engine choice vs embedder choice as sources of variance in
     quality. If the embedder dominates, say so plainly; it reframes the whole project.
   - *Agreement*: engine × engine heatmap of Jaccard@10
   - *Zero-result rate* by engine — the `0.7` cutoff finding, made visible
   - *Drill-down*: pick a scenario, see each engine's ranked list side by side. This is what people
     will actually play with in the demo.

   Build it through the UI if that is faster; export to `hackathon/harness/dashboard/` via serdes so
   it survives a rebuild. The `serdes-workflow` skill covers export/import.

## Verification

- Schema applies cleanly twice in a row.
- Every dashboard card renders from fixture data alone.
- Serdes round-trip: export, drop, re-import, dashboard still works.

## Gotchas

- Long format exists so Metabase can slice without pivoting — do not add wide per-metric columns.
- `returned` is `jsonb` with rank order preserved; agreement metrics can be recomputed from it
  without re-running anything. Keep it that way.
- The harness DB is a *warehouse* to this Metabase instance, not its app DB. Do not point them at the
  same database.
- Sample-size honesty: with ~40 scenarios, differences of a few percent are noise. Put n on the
  charts, and prefer showing distributions over single bars where it fits.

## Bring the data app back after a restart

The dashboard, its cards and the "Search Harness" DB connection live in the instance's app DB
(`local/semantic-dev.db`, H2), so they survive a Metabase restart. What does **not** survive is the
frontend: this worktree has no built frontend, so the UI is served by a dev server on **:8090**. (8080 is
Voytek's ssbudget app; 3000/3001 are an unrelated project — leave them alone.) The backend's CSP only
allows the dev-server port it was booted with, so boot it with that port in the environment and no runtime
patch is needed.

All commands run from the worktree root
`/Users/krever/Projects/metabase/.claude/worktrees/metabase-sqlite-semantic-search`.

1. **Boot Metabase** with the dev-server port in the env (the script passes the environment through):
   ```bash
   MB_FRONTEND_DEV_PORT=8090 ./local/run-semantic-search.sh
   ```
   It auto-picks a free port (3002 unless taken) and writes it to `local/.port`; everything below reads that.

2. **Start the frontend dev server** (separate terminal; takes about a minute until "Rspack compiled successfully"):
   ```bash
   MB_FRONTEND_DEV_PORT=8090 bun run build-hot
   ```
   First time in a fresh checkout, run `bun install` before it.

3. **Results DB** — only if the pgvector container was recreated (the `harness` DB lives in it):
   ```bash
   cd hackathon/harness && npm install && cd results && npm run schema
   ```
   `npm run schema` creates the `harness` DB if missing and applies the idempotent schema and views. The data
   itself is gone with the container in that case; re-run the runner (Agent A) or `npm run fixtures`.

4. **Dashboard** — only if the app DB was reset (dashboard missing). Either rebuild it from code:
   ```bash
   cd hackathon/harness/results && npm run dashboard
   ```
   or import the committed export (needs the "Search Harness" DB connection, which `npm run dashboard` adds):
   ```bash
   cd hackathon/harness/results && npm run serdes -- import
   ```
   Either way the dashboard id may change; the commands print the URL.

**Check it is back:**
- `curl -s -D - -o /dev/null http://localhost:$(cat local/.port)/ | grep -o 'script-src[^;]*localhost:8090'`
  prints a match (CSP allows the dev server). No match → Metabase was booted without `MB_FRONTEND_DEV_PORT=8090`.
- `lsof -nP -iTCP:8090 -sTCP:LISTEN` shows a `node` process (dev server up).
- `cd hackathon/harness/results && npm run check` ends with `0 error(s)`. It runs every card through the API
  with the dashboard's defaults (fixture corpus: expect `0 empty card(s)`). For the golden run:
  `npm run check -- '{"corpus":["northwind-golden-v1"],"scale":null,"scenario":["concept-01"]}'` — 2 empty
  cards are expected until a variant run exists.
- Open the URL printed by `npm run check` and sign in (`dev@metabase.local` / `devdev1234`); all 8 tabs render.

