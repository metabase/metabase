# Transform Optimizer — High-Level Plan

## Goal

Given a slow native (Postgres-only, for now) transform, propose one or more
*equivalent* transforms that produce the same result faster. Most proposals are
a single rewritten transform; some proposals split work across a DAG of
transforms (precompute + final).

Pipeline (in the end-state):

```
slow transform ──┐
                 ├─► context builder ──► metabot agent ──► streamed proposals ──► UI
schema/FK/idx ───┤                       (LLM + prelude    (1..N transforms      (accept / verify
EXPLAIN plan ────┘                        of examples)      forming a DAG)        / discard)
```

## Scope (this branch)

- Source DB engine: **Postgres only**.
- Source transform type: **native** (`{:type :query, :query {:native …, :database N}}`).
- Output of a proposal: **new** transforms, never an update to the original.
  Original stays around until the user accepts and deletes it.
- Verification is **optional**, user-triggered, and runs as a side workflow.

## Architecture sketch

### Touch points in the existing code

From the survey (see `dataset/` for the dataset; references below are the
files we'll hook into):

- `metabase.transforms-base.query/run-query-transform!` — where the source SQL
  for a `:query` transform is compiled. We do *not* modify execution; we just
  re-use `compile-source` to get the SQL string for context.
- `metabase.transforms.models.transform-run` — run history; we'll read
  durations from here to surface "slow transforms" candidates and to compare
  pre/post timings.
- `metabase.transforms-rest.api.transform` — where the new endpoint
  `POST /api/transform/:id/optimize` will live.
- `metabase.metabot.tools.deftool` + `metabase.metabot.tools` — where we
  register the new `propose-transform-optimizations` tool.
- `metabase.metabot.agent.core/run-agent-loop` — reused as-is for streaming.
- `metabase.metabot.api/native-agent-streaming-request` — the streaming
  contract we ride on (AI-SDK v4 SSE).

### New code

Roughly:

```
src/metabase/transform_optimizer/
  core.clj                  ; public entry: optimize-transform!
  pg_introspection.clj      ; pg_class / pg_index / pg_constraint helpers
  sql_extraction.clj        ; pull referenced tables out of a native SQL string
  explain.clj               ; run EXPLAIN (FORMAT JSON) safely
  context.clj               ; assemble the LLM context block
  prelude.clj               ; embed the curated pre→post examples corpus
  verify.clj                ; pre/post equivalence check (EXCEPT both ways)
  models/
    proposal.clj            ; persisted proposal (1..N proposed transforms)
  api.clj                   ; POST /api/transform/:id/optimize + GET proposals

src/metabase/metabot/tools/
  transform_optimizer.clj   ; deftool wrapping core/optimize-transform!

resources/transform_optimizer/
  prelude.md                ; rendered into the system prompt
  examples/                 ; .sql pairs that feed the prelude

frontend/src/metabase/transform_optimizer/
  …                         ; panel on the transform page that streams proposals
```

## Phased delivery

### Phase 0 — Foundation (this commit)

- Postgres dataset + DDL + seed (`dataset/`) sized so the slow queries reliably
  span multiple seconds on a developer laptop.
- A corpus of slow → fast pairs (`queries/`) covering distinct optimization
  patterns. These do double duty: regression fixtures for the verifier *and*
  raw material for the prelude.

### Phase 1 — Read-only backend: context builder

- `pg_introspection`: for a connection + a list of table names, return
  `{table → {columns [], indexes [], foreign_keys [], approx_row_count}}`.
  Use `pg_class.reltuples`, `pg_index`/`pg_indexes`, `pg_constraint`,
  `information_schema.columns`.
- `sql_extraction`: lightweight parser that yields the set of referenced
  schemas/tables for a native query. Start with a regex/keyword approach,
  upgrade to a parser if needed. The goal is "which tables to introspect" —
  imprecision (extra tables) is fine; missing tables is not.
- `explain.clj`: `EXPLAIN (FORMAT JSON, VERBOSE)` against the source DB.
  No `ANALYZE` by default — running the slow query is exactly what we're
  trying to avoid. Add an `:analyze?` opt for opt-in.
- Unit-test all of the above against the seeded Postgres from Phase 0.

### Phase 2 — Prompt + Metabot tool

- `prelude.clj` reads `resources/transform_optimizer/prelude.md` and the
  examples directory; renders into the system prompt.
- `context.clj` builds the per-request payload:
  ```
  ## Transform
  - id, name, target table
  ## SQL
  ```sql … ``` 
  ## Referenced tables
    table A — columns, FKs, indexes, ≈row count
    …
  ## EXPLAIN
  ```json … ```
  ## Run history
  - last N runs: started_at, duration_ms, status
  ```
- `deftool` `propose-transform-optimizations` accepts `{transform_id}` and
  returns a structured payload of N proposals, each:
  ```
  {name, depends_on [], body, rationale, expected_speedup, kind}
  kind ∈ #{:rewrite :rewrite+index :precompute}
  ```
  We instruct the LLM to *not* propose indexes the user can't create
  (target DB write permissions are required; see Phase 5).

### Phase 3 — UI

- Button on the transform page: "Suggest optimizations".
- Streams proposals into a side panel. Each proposal renders as a card with:
  diff (or full new SQL), rationale, expected speedup, accept / verify /
  dismiss actions.
- "Accept" creates N new transforms (linked through `depends_on`) and routes
  the user to the first one. Original transform is untouched.

### Phase 4 — Equivalence verification (optional, user-triggered)

For a single-transform proposal:
```sql
SELECT count(*) FROM (
  (SELECT * FROM <slow_result>  EXCEPT SELECT * FROM <fast_result>)
  UNION ALL
  (SELECT * FROM <fast_result>  EXCEPT SELECT * FROM <slow_result>)
) d;
```
Materialize both sides to temp tables (or use the existing transform
execution path against scratch target names). Surface 0 rows = equivalent;
otherwise show a row-sample diff. Also record both durations so the user
sees the *actual* speedup vs the LLM's estimate.

For DAG proposals: same approach but `<fast_result>` is the leaf of the
proposed DAG, executed in order.

### Phase 5 — Polish & guardrails

- Permission check: optimizer requires `:write` on the source DB (because
  `CREATE INDEX` may be proposed) — or, if the user lacks it, the optimizer
  is constrained to `:rewrite` kinds only.
- Cost guard: skip / warn on transforms whose latest run took longer than a
  threshold (we should not run EXPLAIN ANALYZE against the 30-minute job).
- Telemetry: log proposal acceptance rate + measured speedups; this feeds the
  prelude over time.

## Open questions (deferred)

- Are some optimizations safe to apply automatically (e.g. `NOT IN` →
  `NOT EXISTS` when the column is nullable)? Probably out of scope here.
- DAG persistence: do proposed transforms form a real linked sub-DAG in the
  jobs system, or are they just N independent transforms the user wires up?
  Lean toward the latter for hackathon.
- Multi-database: do we limit proposals to indexes/extensions the user
  *actually has*, or just suggest and let them fail? Currently: suggest with a
  clear "requires …" annotation.

## Phase 0 deliverables (this commit)

- `dataset/01_schema.sql` — DDL, no helpful indexes, foreign keys retained.
- `dataset/02_seed.sql` — bulk-load via `generate_series`; configurable scale.
- `dataset/03_optimized_indexes.sql` — additional indexes referenced by some
  optimized versions (kept separate so we can A/B with and without).
- `queries/00_index.md` — table of pairs with one-line summary.
- `queries/qNN_*.sql` — one file per pair with `-- @slow` / `-- @fast`
  sections and a metadata header.
