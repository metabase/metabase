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
  `driver/describe-table-indexes` — existing index metadata sources used as
  inputs/fallbacks. Full Postgres index shape comes from new catalog queries.

### New code

Roughly:

```
src/metabase/transform_optimizer/
  core.clj                  ; public entry: optimize-transform!
  index_introspection.clj   ; Postgres catalog queries for composite indexes,
                            ;  INCLUDE columns, predicates, and index types
  explain.clj               ; run EXPLAIN (FORMAT JSON, VERBOSE) safely
  context.clj               ; wraps transforms-inspector.context/build-context,
                            ;  adds indexes + EXPLAIN + run history
  prelude.clj               ; embed the curated pre→post examples corpus
  scoring.clj               ; proposals → optimization_degree (deterministic)
  verify.clj                ; bounded pre/post equivalence check
  ddl/
    parse.clj               ; validate CREATE INDEX statements (allowlist)
    execute.clj             ; run a single DDL on the right connection
                            ;  (autocommit handling for CONCURRENTLY)
  models/
    proposal.clj            ; persisted proposal (1..N proposed transforms,
                            ;  + optimization_degree, + ddl_statements,
                            ;  + per-DDL execution status)
  api.clj                   ; POST /api/transform/:id/optimize + GET proposals
                            ; + POST /…/proposal/:pid/ddl/:did/execute
                            ; + POST /…/proposal/:pid/accept

src/metabase/metabot/tools/
  transform_optimizer.clj   ; deftool wrapping core/optimize-transform!

resources/transform_optimizer/
  prelude.md                ; rendered into the system prompt
  examples/                 ; .sql pairs that feed the prelude

frontend/src/metabase/transform_optimizer/
  …                         ; panel on the transform page that streams
                            ;  the optimization_degree + proposals
```

We do **not** write our own SQL parser, but we do write Postgres-specific
index introspection:
- Table / column / FK info comes from the appdb (`Table`, `Field` with
  `fk_target_field_id`) which sync already populates.
- "Is this column indexed?" comes from `Field.database_indexed`.
- "What's the full shape of the index (composite columns, INCLUDE list,
  partial predicate, GIN/BRIN type)?" is the piece sync does *not*
  persist. The existing `driver/describe-table-indexes` default is too
  lossy for this feature, so `index_introspection.clj` queries Postgres
  catalogs directly and treats `driver/describe-table-indexes` as a fallback.
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
  For Postgres, it queries `pg_index`, `pg_class`, `pg_namespace`,
  `pg_attribute`, `pg_am`, and `pg_get_expr` at request time for each
  referenced table to recover the shape sync drops on the floor:
  composite key column order, `INCLUDE` payload, partial predicates,
  uniqueness, and index type (btree / gin / brin / hash). Cached for the
  duration of one optimizer request. If catalog introspection fails, it
  falls back to the simplified `driver/describe-table-indexes` output and
  marks the context as partial rather than pretending full index detail is
  available.
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
   proposals [{id              ; stable per-stream id
               name
               kind            ; see below
               severity        ; :high | :medium | :low
               rationale
               expected_speedup
               body            ; SQL of the new transform, nil for pure-DDL
               depends_on []   ; ids of sibling proposals in the same DAG
               ddl_statements  ; 0..N — see "DDL statements" subsection
                 [{id
                   target       ; :source-db | :transform-target
                                ;  | {:precompute-of <sibling proposal id>}
                   statement    ; CREATE INDEX … (validated server-side)
                   rationale}]}]}

  kind     ∈ #{:rewrite           ; new body, no DDL
               :index             ; no body change, DDL only
               :rewrite+index     ; new body and DDL
               :precompute}       ; DAG; DDL on precompute targets is common
  severity ∈ #{:high :medium :low}  ; required on every proposal
  ```
  We instruct the LLM to annotate proposed indexes with any requirements
  or caveats it depends on. We also explicitly allow `proposals` to be empty
  when the transform is already optimal.

#### DDL statements

The LLM may decide that the best optimization is a new index — either on
a source-DB table (q04: monthly revenue) or on a transform's
target/precompute target (q07: cohort rollups). For this branch, DDL is a
first-class **advisory** proposal artifact, not something Metabase executes.
The UI shows the statement, rationale, target, and caveats so the user can
review or copy it.

**Constraints applied to every emitted statement** (enforced in
`ddl/parse.clj`, not trusted from the LLM):

- Must be a single `CREATE INDEX` statement (parsed; reject `DROP`,
  `ALTER`, `GRANT`, multi-statement, etc.).
- Must include `IF NOT EXISTS` so accept is idempotent.
- For `target = :source-db`, prefer `CONCURRENTLY` so we don't lock the
  source table out from under other readers. The LLM prompt requests
  this; the validator does not require it.
- Fully-qualified schema + table name. The schema must be one of those
  reachable from the transform's referenced tables.
- Index name follows a convention (`idx_<table>_<cols>_<hash>`) so we
  can detect duplicates the LLM may suggest across proposals.

**Execution semantics** (`ddl/execute.clj`):

- One statement runs against one connection. `CREATE INDEX CONCURRENTLY`
  cannot run inside a transaction; we use a fresh connection with
  `setAutoCommit(true)` for that path.
- Failures are surfaced to the UI with the Postgres error message;
  partial execution of a multi-DDL proposal does *not* roll back the
  succeeded statements (idempotent re-execution is the recovery path).
- Each executed statement is recorded on the `Proposal` row
  (`ddl_status[ddl_id] = :executed | :failed | :skipped`).

**DDL targeting `transform-target`** has a known wrinkle: the standard
transform flow recreates the target table on each run, so an index
created post-materialization would be lost. We address this in two
ways:

1. The optimizer prefers proposing precompute splits as **incremental**
   transforms (`:type :table-incremental`) when the inner SQL is
   amenable. Incremental targets retain their indexes across runs.
2. For non-incremental targets we register the DDL as
   *post-materialization* on the new transform — the transform pipeline
   runs the `CREATE INDEX IF NOT EXISTS` statements after each
   materialization. Cheap if nothing changed; rebuilds when the table is
   recreated. (Open question if this is enough for very large precompute
   targets — see Open Questions.)

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
    expected speedup.
    - When `ddl_statements` is non-empty, an "Index changes" subsection
      lists each statement with its rationale, the formatted DDL, and
      per-statement state: `pending → running → executed | failed`.
      Failed statements show the Postgres error inline with a "Retry"
      button.
    - Per-card actions:
      - **Run DDL** — executes the proposal's DDL statements only.
        Useful when the user wants the index but isn't ready to commit
        to the rewrite. Pure-`:index` proposals: this is the primary
        action.
      - **Accept** — for `:rewrite` / `:rewrite+index`: creates the new
        transform(s), then runs the DDL. For `:precompute`: creates the
        whole DAG (in `depends_on` order), then runs the per-target DDL
        (incremental targets up front, post-materialization DDL stored
        on the transform).
      - **Verify** — opens the equivalence-check flow (Phase 4).
      - **Dismiss** — drops the proposal locally; can be re-fetched.
- "Accept" creates N new transforms (linked through `depends_on`) and routes
  the user to the first one. Original transform is untouched. Executed
  DDL is not auto-reverted on dismiss — CREATE INDEX is durable on
  purpose; the panel surfaces the resulting index name so the user can
  drop it manually if they change their mind.

### Phase 4 — Equivalence verification (optional, user-triggered)

For a single-transform proposal, first compare the output schemas. Column
count, names, and compatible database types must match before row comparison
starts.

Then materialize both sides into bounded temp tables using scratch target
names, with a timeout and cleanup in `finally`. The row comparison should
preserve duplicate row multiplicity. On Postgres, prefer `EXCEPT ALL`:

```sql
SELECT count(*) FROM (
  (SELECT * FROM <slow_result>  EXCEPT ALL SELECT * FROM <fast_result>)
  UNION ALL
  (SELECT * FROM <fast_result>  EXCEPT ALL SELECT * FROM <slow_result>)
) d;
```

Surface 0 rows = equivalent; otherwise show a row-sample diff. Also record
both durations so the user sees the *actual* speedup vs the LLM's estimate.
Queries using volatile functions such as `now()` or `random()` are marked
with a verification caveat because repeated execution can produce different
results even when a rewrite is logically valid.

For DAG proposals, verification is deferred until DAG creation/acceptance is
designed.

### Phase 5 — Polish & guardrails

- **Permission check for proposing**: the optimizer can always *propose*
  DDL — but the proposal API marks each `ddl_statement` with
  `advisory_only?`. We do *not* hide the proposals — read-only users can
  still see what their team should run.
- **DDL validator** (`ddl/parse.clj`): runs on every statement before
  it's shown, regardless of how it got into the system. Reject
  anything that isn't `CREATE INDEX [CONCURRENTLY] [IF NOT EXISTS]` on a
  schema-qualified table belonging to the referenced set. This is the
  primary defence against prompt injection coercing the LLM into
  emitting an `ALTER USER … SUPERUSER`.
- **Cost guard**: skip / warn on transforms whose latest run took longer
  than a threshold (we should not run EXPLAIN ANALYZE against the
  30-minute job).
- **Telemetry**: log proposal acceptance rate and measured speedups; this
  feeds the prelude over time.

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
- Post-materialization DDL on very large precompute targets: rebuilding a
  GIN index on each transform run is expensive. Two ways out: (a) push
  the user toward incremental transforms for these cases (we already
  prefer this in the proposal), or (b) ship a smarter materialization
  strategy ("CREATE TABLE … AS … then CREATE INDEX … once" vs. "TRUNCATE
  + INSERT" to keep indexes). Out of scope this branch.

## Phase 0 deliverables (this commit)

- `dataset/01_schema.sql` — DDL, no helpful indexes, foreign keys retained.
- `dataset/02_seed.sql` — bulk-load via `generate_series`; configurable scale.
- `dataset/03_optimized_indexes.sql` — additional indexes referenced by some
  optimized versions (kept separate so we can A/B with and without).
- `queries/00_index.md` — table of pairs with one-line summary.
- `queries/qNN_*.sql` — one file per pair with `-- @slow` / `-- @fast`
  sections and a metadata header.
