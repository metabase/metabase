# Transform Optimizer — High-Level Plan

## Goal

Given a slow native (Postgres-only, for now) transform, propose one or more
*equivalent* transforms that produce the same result faster. Most proposals are
a single rewritten transform; some proposals split work across a DAG of
transforms (precompute + final).

Pipeline (in the end-state):

```
slow transform ──┐
                 ├─► context builder ──► metabot agent ──► streamed { proposals[]    ──► UI
schema/FK/idx ───┤                       (LLM + prelude        + optimization_degree }   (accept / verify
EXPLAIN plan ────┘                        of examples)                                    / discard)
```

The streamed response carries two things:

1. **Proposals** — 0..N alternative transforms (single rewrites, or DAGs
   when split-for-precompute is warranted). Each carries a kind, rationale,
   expected speedup, and severity. A proposal-free response is a valid
   answer for an already-optimal transform.
2. **Optimization degree** — a 0–100 score answering "how optimized is the
   *current* transform?" Computed deterministically from the proposals
   (see Phase 2). 100 ⇔ proposals is empty ⇔ "no further optimizations
   found". This is shown first in the UI so the user immediately knows
   whether to bother reading proposals.

## Scope (this branch)

- Source DB engine: **Postgres only**.
- Source transform type: **native** (`{:type :query, :query {:native …, :database N}}`).
- Output of a proposal: **new** transforms, never an update to the original.
  Original stays around.
- Verification is **optional**, user-triggered, and runs as a side workflow.

## Architecture sketch

### Touch points in the existing code

From the survey (see `dataset/` for the dataset; references below are the
files we'll hook into):

- `metabase.transforms-base.query/run-query-transform!` — where the source SQL
  for a `:query` transform is compiled. We do *not* modify execution; we just
  re-use `compile-source` to get the SQL string for context.
- `metabase.transforms-rest.api.transform` — where the new endpoint
  `POST /api/transform/:id/optimize` will live.
- `metabase.metabot.tools.deftool` + `metabase.metabot.tools` — where we
  register the new `propose-transform-optimizations` tool.
- `metabase.metabot.agent.core/run-agent-loop` — reused as-is for streaming.
- `metabase.metabot.api/native-agent-streaming-request` — the streaming
  contract we ride on (AI-SDK v4 SSE).
- `metabase-enterprise.transforms-inspector.context/build-context` — **already**
  assembles a per-transform context map (source/target tables, field metadata,
  join structure, column mappings) for LLM consumption. We *extend* it: add
  detailed index info, an `EXPLAIN` block, and recent-run durations.
- `metabase-enterprise.transforms-inspector.query-analysis/analyze-native-query`
  — **already** extracts referenced tables/columns from a native SQL string
  via Macaw + `sql-tools`. We call it directly; we do not write our own parser.
- `metabase.sync.fetch-metadata/index-metadata` and
  `driver/describe-table-indexes` — pulled at optimizer-request time for
  index detail beyond the `Field.database_indexed` bool that sync persists.

### New code

Roughly:

```
src/metabase/transform_optimizer/
  core.clj                  ; public entry: optimize-transform!
  index_introspection.clj   ; thin layer over driver/describe-table-indexes,
                            ;  caches per-request; complements appdb FK/PK
  explain.clj               ; run EXPLAIN (FORMAT JSON, VERBOSE) safely
  context.clj               ; wraps transforms-inspector.context/build-context,
                            ;  adds indexes + EXPLAIN + run history
  prelude.clj               ; embed the curated pre→post examples corpus
  scoring.clj               ; proposals → optimization_degree (deterministic)
  verify.clj                ; pre/post equivalence check (EXCEPT both ways)
  models/
    proposal.clj            ; persisted proposal (1..N proposed transforms,
                            ;  + optimization_degree of the original)
  api.clj                   ; POST /api/transform/:id/optimize + GET proposals

src/metabase/metabot/tools/
  transform_optimizer.clj   ; deftool wrapping core/optimize-transform!

resources/transform_optimizer/
  prelude.md                ; rendered into the system prompt
  examples/                 ; .sql pairs that feed the prelude

frontend/src/metabase/transform_optimizer/
  …                         ; panel on the transform page that streams
                            ;  the optimization_degree + proposals
```

We do **not** write our own `pg_introspection` or `sql_extraction`:
- Table / column / FK info comes from the appdb (`Table`, `Field` with
  `fk_target_field_id`) which sync already populates.
- "Is this column indexed?" comes from `Field.database_indexed`.
- "What's the full shape of the index (composite columns, INCLUDE list,
  partial predicate, GIN/BRIN type)?" is the only piece sync does *not*
  persist; we call `driver/describe-table-indexes` at request time.
- Native SQL parsing reuses `transforms-inspector.query-analysis`.

## Phased delivery

### Phase 0 — Foundation (this commit)

- Postgres dataset + DDL + seed (`dataset/`) sized so the slow queries reliably
  span multiple seconds on a developer laptop.
- A corpus of slow → fast pairs (`queries/`) covering distinct optimization
  patterns. These do double duty: regression fixtures for the verifier *and*
  raw material for the prelude.

### Phase 1 — Read-only backend: context builder

The context we feed the LLM is mostly assembled from existing utilities.
What we add is index detail, EXPLAIN output, and recent-run timing.

- **Reuse `transforms-inspector.context/build-context`** for the bulk of the
  payload: source tables (with `column_count`, fingerprint-derived field
  stats), target table, join structure, column-to-column mappings between
  the transform output and its inputs.
- **Reuse `transforms-inspector.query-analysis/analyze-native-query`** to
  obtain the set of `{table-id, column-id}` references for a native SQL
  body. The optimizer never invents its own SQL parser.
- **FKs and "is this column indexed?"** come for free from the appdb:
  `Field.fk_target_field_id` (a Toucan2 hydration step) and the
  `Field.database_indexed` boolean (populated by `sync.sync-metadata.indexes`).
- **`index_introspection.clj`** is the only new introspection code we write.
  It calls `driver/describe-table-indexes` at request time for each
  referenced table to recover the shape sync drops on the floor:
  composite column order, `INCLUDE` payload, partial predicate, index type
  (btree / gin / brin / hash). Cached for the duration of one optimizer
  request. Falls back gracefully on drivers that don't implement the
  multimethod (the LLM is told "index detail unavailable" rather than
  hallucinating).
- **`explain.clj`**: `EXPLAIN (FORMAT JSON, VERBOSE)` against the source
  DB. No `ANALYZE` by default — running the slow query is exactly what
  we're trying to avoid. `:analyze?` opt-in flag for advanced callers.
- **Approximate row counts**: prefer `Table` fingerprint row count when
  fresh; fall back to `pg_class.reltuples` if missing. (We only need an
  order-of-magnitude figure for the LLM.)
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
  streams a structured payload:
  ```
  {optimization_degree    ; integer in [0, 100]
   summary                ; one-paragraph diagnosis
   proposals [{name, depends_on [], body, rationale,
               kind, severity, expected_speedup}]}

  kind     ∈ #{:rewrite :rewrite+index :precompute}
  severity ∈ #{:high :medium :low}  ; required on every proposal
  ```
  We instruct the LLM to *not* propose indexes the user can't create
  (target DB write permissions are required; see Phase 5). We also
  explicitly allow `proposals` to be empty when the transform is already
  optimal.

#### Optimization degree

The score is **deterministic** given the proposal set — the LLM does
*not* emit it directly, so the same proposals always yield the same
score and we don't have to babysit LLM calibration:

```
optimization_degree =
  100 - clamp(Σ weight(severity_i), 0, 100)

weight(:high)   = 30
weight(:medium) = 15
weight(:low)    =  5
```

Properties this gives us:

- No proposals ⇒ score is 100 (the LLM saying "I looked and found
  nothing worth changing"). The UI shows "✓ already optimized".
- Three high-severity proposals ⇒ 10 (lots of room).
- Two medium proposals ⇒ 70 ("there's some room, but it's not on fire").
- Score depends only on what the LLM proposes — not on what it *says*.

The LLM is given an explicit severity rubric in the system prompt:

- **high**: ≥100× speedup expected, or removes an unbounded-time risk
  (e.g. NOT-IN-on-nullable, full-table LIKE-search).
- **medium**: 10–100× speedup, or eliminates re-computation by adding
  a precompute step.
- **low**: <10× speedup, cosmetic rewrite, or speculative.

#### Streaming order

The agent emits, in order:

1. `summary` (one paragraph, lands quickly so the user has something to
   read while proposals generate)
2. `proposals[*]` one at a time (each as its own SSE event/data part)
3. Final `optimization_degree`, computed from the accumulated proposals
   when the LLM signals end-of-output. Computed *server-side* in
   `scoring.clj` — not trusted from the model.

### Phase 3 — UI

- Button on the transform page: "Suggest optimizations".
- Side panel opens with two regions:
  - **Header**: a large optimization-degree dial (e.g. `73 / 100`,
    colour-coded). While streaming, it shows a "Analyzing…" spinner;
    when the LLM emits its summary the spinner becomes the summary
    paragraph; when streaming ends, the dial animates to the computed
    score. If the score is 100, the panel collapses to
    "✓ Already optimized — nothing to suggest" and the proposal list
    is hidden.
  - **Proposals list**: each proposal renders as it arrives, as a card
    with: severity badge, kind tag, diff (or full new SQL), rationale,
    expected speedup, accept / verify / dismiss actions.
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
- Score calibration: do we want to factor *measured* (verifier-run) speedups
  back into the score after Phase 4, so accepted proposals retroactively
  re-grade the score? Lean no — the score should reflect the *as-presented*
  diagnosis, not become a moving target.
- Should the severity rubric also factor in the EXPLAIN cost ratio between
  the slow and proposed plans, so the LLM has a less subjective anchor?
  Worth a small experiment in Phase 2.

## Phase 0 deliverables (this commit)

- `dataset/01_schema.sql` — DDL, no helpful indexes, foreign keys retained.
- `dataset/02_seed.sql` — bulk-load via `generate_series`; configurable scale.
- `dataset/03_optimized_indexes.sql` — additional indexes referenced by some
  optimized versions (kept separate so we can A/B with and without).
- `queries/00_index.md` — table of pairs with one-line summary.
- `queries/qNN_*.sql` — one file per pair with `-- @slow` / `-- @fast`
  sections and a metadata header.
