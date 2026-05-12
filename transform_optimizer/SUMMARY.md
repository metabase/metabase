# Transform Optimizer — Implementation Status & Open Tasks

Companion to [`PLAN.md`](./PLAN.md). PLAN describes *what* we're building;
this doc tracks *where we are*. Keep it current — it's the parallel-work
coordination surface.

## Status by phase

### Phase 0 — Foundation ✅ **done**

| Artifact | Path | Notes |
|---|---|---|
| DDL | `dataset/01_schema.sql` | `shop` schema; FKs kept, no helper indexes |
| Seed | `dataset/02_seed.sql` | 50k customers, 500k orders, 1.5M order_items, 2M events, 250k reviews — full harness run (load → verify) ~1–1.5 min on a dev laptop |
| Optimized indexes | `dataset/03_optimized_indexes.sql` | btree + `pg_trgm` GIN; applied between Phase-2-slow and Phase-4-fast in the harness |
| 8 slow→fast query pairs | `queries/qNN_*.sql` | `-- @meta` / `-- @slow` / `-- @fast` markers, one file per pair |
| Validation harness | `harness/run.sh`, `harness/run.clj` | Loads schema+seed, runs all pairs, EXCEPT-ALL equivalence check, geomean speedup. Heartbeat every 3 s. |

### Phase 1 — Read-only context builder ✅ **done**

All under `enterprise/backend/src/metabase_enterprise/transform_optimizer/`:

| Namespace | File | What it does |
|---|---|---|
| `index-introspection` | `index_introspection.clj` | Single-round-trip Postgres catalog query → full index shape (composite keys, INCLUDE, partial predicate, access method, raw `pg_get_indexdef`). Accepts either a flat `[schema table]` pair or a sequence of pairs. Falls back to nil on non-Postgres drivers. |
| `explain` | `explain.clj` | `EXPLAIN (FORMAT JSON, VERBOSE)`. No `ANALYZE` by default. Postgres only. |
| `context` | `context.clj` | Top-level builder. Wraps `transforms-inspector.context/build-context`, resolves FK edges via `Field.fk_target_field_id`, attaches indexes + EXPLAIN + last-10 runs with durations. |

### Phase 2 — Prompt + LLM wiring ✅ **done**

| Namespace | File | What it does |
|---|---|---|
| `prelude` | `prelude.clj` + `resources/transform_optimizer/prelude.md` | Static prelude (output schema, severity rubric, DDL constraints, 4 worked examples — one per `kind`). Loaded once and cached. |
| `prompt` | `prompt.clj` | Renders context map to markdown for the user-side of the prompt. |
| `scoring` | `scoring.clj` | Pure `proposals → optimization_degree` per the rubric (`100 − Σ severity_weights`; high=30, med=15, low=5). |
| `ddl.parse` | `ddl/parse.clj` | Allowlist validator. Strips strings/comments, rejects multi-statement, rejects forbidden keywords, regex-matches canonical `CREATE INDEX`, asserts schema-qualified target is in referenced-tables set. |
| `llm` | `llm.clj` | Calls `metabot.self/call-llm-structured` with our prelude+context as the user message and the proposals JSON schema. Inherits the metabot client's retry / telemetry / provider abstraction. Default model: `anthropic/claude-sonnet-4-6`. |
| `core` | `core.clj` | Public entry `optimize!`. Stitches everything together. Server-side proposal post-processing (DDL validation tag + scoring) is wired in. |
| `api` | `api.clj` | HTTP endpoints mounted at `/api/ee/transform-optimizer`. |

### Phase 3 — UI ✅ **walking skeleton done** (mock-aware, BE-wired)

All under `enterprise/frontend/src/metabase-enterprise/transform_optimizer/` unless noted:

| Layer | Path | What it does |
|---|---|---|
| OSS plugin slot | `frontend/src/metabase/plugins/oss/transform-optimizer.ts` | New `PLUGIN_TRANSFORM_OPTIMIZER` with `RunPageSection` injection point. Re-exported + reinitialized in `frontend/src/metabase/plugins/index.ts`. |
| OSS host | `frontend/src/metabase/transforms/pages/TransformRunPage/RunSection/RunSection.tsx` | Renders `PLUGIN_TRANSFORM_OPTIMIZER.RunPageSection` between the run output and the tags row when the EE plugin registers a section. |
| EE plugin init | `index.ts` | Gated on `transforms-python` premium feature; registers `TransformOptimizerSection` in the OSS slot. |
| Types | `types/index.ts` | `Proposal`, `DdlStatement`, `OptimizerStreamEvent`, `OptimizerStreamState` matching the wire contract below. |
| SSE client | `api/stream.ts` | `runOptimizerStream({transformId, analyze, signal, onEvent})`. Hand-rolled SSE parser (`event:` / `data:` framing, multi-chunk frames, comments, malformed JSON tolerated). Uses the legacy `api` client for basename + auth headers. Maps non-OK responses to a single synthetic `error` event. |
| Mutations | `api/index.ts` | RTK Query mutations on `EnterpriseApi`: `useVerifyProposalMutation`, `useAcceptProposalMutation`. |
| Stream hook | `hooks/use-optimizer-stream.ts` | Reducer-driven `{state, start, abort, reset, dismissProposal}`. Dedupes proposals by id, auto-cancels on unmount and on re-`start`, falls back to `done` if the server never emits a terminal event. |
| Dial | `components/OptimizationDegreeDial/` | SVG ring with the 4 colour buckets per the table below. Spinner while streaming; the section hides the dial entirely on error (avoids double-rendering the error next to the alert). |
| Proposal card | `components/ProposalCard/ProposalCard.tsx` | Severity badge, kind tag, expected-speedup chip, SQL `<Code block>`, accept/verify/dismiss actions with permission tooltips. |
| Index changes | `components/ProposalCard/IndexChangesSection.tsx` | Per-DDL row: target label, validation badge (accepted / rejected with reason), execution-status badge (pending/running/executed/failed/skipped — only `pending` is reachable while DDL is advisory), statement code block, rationale, error detail. |
| Section orchestrator | `components/TransformOptimizerSection/TransformOptimizerSection.tsx` | Trigger button (Suggest / Stop / Re-analyze), dial, summary paragraph, error `<Alert>` with Retry, proposal list. Collapses to "✓ Already optimized" when stream ends with score 100 and zero proposals. |
| Unit test | `api/stream.unit.spec.ts` | 4 cases: ordered event parsing, chunk-split frames, HTTP-error → synthetic error event, malformed/comment frames ignored. All pass. |

Maps to the FE task list:

| Task | Status | Notes |
|---|---|---|
| FE-1 trigger button | ✅ | `<TriggerButton>` in `TransformOptimizerSection.tsx`. |
| FE-2 section under RunSection | ✅ | Injected via the new `PLUGIN_TRANSFORM_OPTIMIZER` slot. |
| FE-3 optimization-degree dial | ✅ | Colour buckets per "Severity → score mapping" table. Streaming spinner; collapse-to-✓ handled by the section, not the dial. |
| FE-4 summary text region | ✅ | Renders below the dial as soon as the `summary` event arrives. Suppressed while erroring. |
| FE-5 proposal card | ✅ | Severity, kind, rationale, expected speedup, SQL block. |
| FE-6 index-changes subsection | ✅ | DDL state + validation status with rejection reason inline. |
| FE-7 per-card actions | ✅ | Wired to `useVerifyProposalMutation` / `useAcceptProposalMutation`; dismiss is local. Buttons disabled-with-tooltip when `readOnly`. |
| FE-8 stream error rendering | ✅ | Inline `<Alert color="error">` + Retry; toasts handled by `useMetadataToasts` for accept/verify failures. Dial is hidden in error state so the error renders once. |

### Phase 4 — Equivalence verification 🟡 **partial (single-transform only)**

| Namespace | File | What it does | Status |
|---|---|---|---|
| `verify` | `verify.clj` | Materialises slow + proposal SQL into a scratch schema, schema-compatibility check, `EXCEPT ALL` diff in both directions, sample-diff capture. Postgres only. | ✅ single proposals |
| | | Precompute (DAG) verification — materialise each precompute body and rewrite the leaf's `<pN target>` references before EXCEPT-ALL. | ⛔ deferred (see C3) |

### Phase 5 — Polish & guardrails 🟡 **partial**

- ✅ DDL validator (`ddl/parse.clj`) runs on every emitted statement.
- ✅ Accept does **not** execute DDL; advisory text only.
- ⛔ Permission-checking against source-DB write perms (only `read-check` so far).
- ⛔ Cost guard (skip-EXPLAIN-ANALYZE on long-running transforms).
- ⛔ Telemetry on acceptance / measured speedups beyond what metabot-self already exports.

---

## Open BE tasks

### Done

| # | Task | Notes |
|---|---|---|
| BE-1 | ✅ Wire LLM call | `llm.clj` calls `metabot.self/call-llm-structured` with the structured-output schema. Default model `anthropic/claude-sonnet-4-6`. Prelude + context concatenated into one user message (call-llm-structured has no separate system slot). |
| BE-2 | ✅ HTTP streaming endpoint | `api.clj` POST `/api/ee/transform-optimizer/:id/optimize` emits the SSE events per the **Streaming endpoint** contract below. Buffered today (LLM call completes before any event is emitted); upgrade to true streaming is **F3**. |
| BE-4 | ✅ Verify endpoint (single proposal) | `verify.clj` materialises both sides into a scratch schema and EXCEPT-ALL diffs both directions. Precompute (DAG) verification deferred — see **C3**. |
| BE-5 | ✅ Accept endpoint | `accept.clj` creates a transform per proposal that has a body; pure-`:index` proposals are skipped. DDL returned as advisory. DAG body-substitution still missing — see **C1**. |
| BE-7 | ✅ `clj-kondo` module config | `enterprise/transform-optimizer` registered; `inspector.context` + `inspector.query-analysis` added to `enterprise/transforms-inspector`'s `:api` set. |

### Correctness / completeness — ship-blockers

These surfaced when I reviewed the just-written code; they're the gaps a
real user would hit on day one.

| # | Where | What | Effort |
|---|---|---|---|
| **C1** | `accept.clj` | **DAG body-substitution.** When `p3.body` says `… FROM <p1 target> …`, accept must replace `<p1 target>` with the actual `schema.table` of the just-created sibling. Without this, precompute accept silently emits broken transforms. | ~45 min |
| **C2** | `accept.clj` | **Topological-order check + target-name collision detection.** Verify caller-given proposal order matches `depends_on`, reject duplicate target names within the batch, and refuse if a target name already exists in the destination DB. | ~30 min |
| **C3** | `verify.clj` | **DAG verification.** Currently returns 422 on `kind = precompute`. Extend to materialise each precompute body to a scratch table, substitute its name into the leaf, then EXCEPT-ALL. | ~1 hr |
| **C4** | `verify.clj` | **Scratch-schema isolation.** Two concurrent `/verify` calls both write `transform_optimizer_verify.slow` and clobber each other. Switch to a per-request scratch identifier (`slow_<uuid>` / `fast_<uuid>` or a randomly-named schema). | ~20 min |
| **C5** | `api_routes/routes.clj` | **Correct feature flag.** We piggyback on `:transforms-python` as a placeholder. Define a proper `:transform-optimizer` premium feature in `metabase.premium-features` and switch the `premium-handler` over. | ~15 min |
| **C6** | `accept.clj` | **Body sanity check** before insert. Reject empty / whitespace-only / unparseable `body` per-proposal rather than 500-ing inside `create-transform!`. | ~15 min |

### Hardening

| # | Where | What |
|---|---|---|
| **H1 / BE-9** | `api.clj` accept | Write-permission check on the target DB. Today only `read-check` runs on the source transform; a read-only user can call `/accept` and 500 in `create-transform!`. |
| **H2 / BE-10** | `core.clj` | Cost guard: if the latest `transform_run.duration_ms` exceeds N minutes, decline `EXPLAIN ANALYZE` and the `/verify` materialise path. |
| **H3** | `api.clj` optimize | Streaming-endpoint deadline. `call-llm-structured` retries internally but the HTTP request has no overall timeout — a wedged provider holds the connection forever. |
| **H4** | `llm.clj` | Validate the LLM's structured response against the malli schema before passing to `finalise-proposals`. A schema-violating response today flows straight through and may NPE downstream. |
| **H5** | `llm.clj` | Promote `model` / `temperature` to `defsetting` so the LLM can be tuned per-tenant without code edits. |
| **H6** | all `api.clj` endpoints | Telemetry events: `transform-optimizer/proposed`, `/accepted`, `/verified` with severities, kinds, and measured speedups. Feeds the prelude over time. |
| **H7** | `verify.clj` | Wrap each `DROP TABLE` in the `cleanup!` path in its own try/catch + log; today a failing cleanup leaks the scratch table for the rest of the session. |
| **H8** | `api.clj` accept | Audit-log who accepted which proposal IDs for which transform. |
| **H9** | `core.clj` | `source-tables-readable?` precheck (mirror `transforms-inspector`). User can read the transform but might lack read on a referenced table; today the optimizer would still call the LLM with their schema metadata. |

### Future / deferred

| # | Task | Depends on |
|---|---|---|
| **F1 / BE-6** | Persistence model `:model/TransformOptimizerProposal` (Liquibase migration + Toucan2 model). Stores the streamed payload + per-DDL `:validation` tags. | — |
| **F2 / BE-3** | `GET /api/ee/transform-optimizer/:id/proposals` (fetch persisted, most-recent-first). | F1 |
| **F3** | True incremental SSE streaming — parse Claude's `tool-input` deltas live and emit `summary` / `proposal` events as each JSON object completes, instead of buffering the full LLM response. | — |
| **F4** | Post-accept verify — optionally run `verify.clj` against each just-created transform and include the measured speedup in the accept response. | C1, C3 |
| **F5 / BE-8** | Integration tests for verify / accept / streaming endpoint against the seeded Postgres from the harness. Pure unit tests already cover scoring / parse / prompt / prelude / core. | — |
| **F6** | Score-from-EXPLAIN anchor — feed slow vs proposed EXPLAIN cost ratios into the severity rubric so the LLM has a less subjective anchor (per PLAN open questions). | — |

### Recommended next pass

In this order — each step is largely independent of the next:

1. **C5** (feature flag — 15 min, removes wrong-feature gating).
2. **C4** (scratch isolation — 20 min, prevents corruption under concurrent verify).
3. **H4** (validate LLM response — 20 min, prevents downstream NPEs).
4. **C1 + C2 + C3** (full DAG support across accept + verify — together ~1.5–2 hr, unlocks the precompute kind end-to-end).
5. **H1** (write-perm check at accept — 15 min, security hygiene).


## Open FE tasks

FE-1..FE-8 are landed (see Phase 3 above). What's left:

| # | Task | Depends on | Notes |
|---|---|---|---|
| FE-9 | Empty-state polish | — | First-visit affordance before the user clicks "Suggest optimizations" (currently the section is just the trigger row). |
| FE-10 | "Already optimized" collapse animation | — | Cosmetic; the panel currently swaps to the Alert without a transition. |
---

## Streaming endpoint — wire contract

Backend exposes one endpoint that streams the optimizer's output. **Frontend
should mock against this contract until BE-1 + BE-2 land.** Mockable with
Mirage / MSW; sample fixture below.

### Request

```
POST /api/ee/transform-optimizer/:id/optimize
Accept: text/event-stream
Content-Type: application/json
```

Body (optional):

```json
{
  "analyze": false   // forwarded to EXPLAIN; off by default
}
```

### Response

`text/event-stream` (SSE). The response emits a sequence of events in this
order:

1. **One** `summary` event (lands quickly; gives the user something to read
   while proposals are generated).
2. **Zero or more** `proposal` events, one per proposal, in DAG-topological
   order (`depends_on` references always precede their dependants).
3. **Exactly one** `done` event at end-of-stream carrying the deterministic
   `optimization_degree` (computed server-side from the accumulated
   proposals — *not* trusted from the LLM).
4. If anything fails mid-stream: a single `error` event, then the stream
   closes. Partial proposals already emitted remain valid.

#### Event: `summary`

```
event: summary
data: {"text": "Three correlated subqueries in the SELECT list cause an O(C×N) scan over orders. Two precompute opportunities and one DDL index would close the gap."}
```

#### Event: `proposal`

```
event: proposal
data: {
  "id": "p1",
  "name": "Use GROUP BY rollup instead of correlated subqueries",
  "kind": "rewrite",                       // "rewrite" | "index" | "rewrite+index" | "precompute"
  "severity": "high",                       // "high" | "medium" | "low"
  "rationale": "Postgres re-runs each subquery once per outer row. A GROUP BY rollup is one pass.",
  "expected_speedup": "≥100×",
  "body": "SELECT c.id, c.name, ...",       // null for kind = "index"
  "depends_on": [],                          // proposal ids this depends on (DAG)
  "ddl_statements": [
    {
      "id": "ddl1",
      "target": "source-db",                 // "source-db" | "transform-target" | { "precompute-of": "<sibling-id>" }
      "statement": "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id ON shop.orders (customer_id);",
      "rationale": "Backs the GROUP BY rollup.",
      "validation": "accepted",              // "accepted" | "rejected" — server-side allowlist result
      "index_name": "idx_orders_customer_id",
      "rejection": null                      // present only when validation = "rejected": { "reason": "<kw>", "detail": "..." }
    }
  ]
}
```

#### Event: `done`

```
event: done
data: { "optimization_degree": 73 }
```

#### Event: `error`

```
event: error
data: { "message": "Source database is not Postgres; optimizer only supports Postgres in this branch.", "retryable": false }
```

### Severity → score mapping (for FE colour coding)

The dial colour should follow the same buckets the BE computes from:

| Score range | Suggested colour | Meaning |
|---|---|---|
| 100 | green | Already optimized; panel collapses |
| 70 – 99 | green-yellow | Minor room |
| 40 – 69 | orange | Real wins available |
| 0 – 39 | red | Multiple high-severity issues |

### Sample full stream (mock fixture)

```
event: summary
data: {"text": "Three correlated subqueries scan orders once per customer. A single GROUP BY rollup eliminates the fan-out."}

event: proposal
data: {"id":"p1","name":"Rewrite to GROUP BY rollup","kind":"rewrite","severity":"high","rationale":"Eliminates O(C×N) fan-out.","expected_speedup":"≥100×","body":"SELECT c.id, c.name, COALESCE(agg.order_count, 0) ...","depends_on":[],"ddl_statements":[]}

event: proposal
data: {"id":"p2","name":"Index supporting the rollup","kind":"index","severity":"medium","rationale":"Speeds the GROUP BY pass; useful for other transforms.","expected_speedup":"5–10×","body":null,"depends_on":[],"ddl_statements":[{"id":"d1","target":"source-db","statement":"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id ON shop.orders (customer_id);","rationale":"Backs customer_id grouping.","validation":"accepted","index_name":"idx_orders_customer_id","rejection":null}]}

event: done
data: {"optimization_degree":55}
```

---

## Other endpoints (request/response only — no streaming)

### Verify

```
POST /api/ee/transform-optimizer/:id/proposal/verify
```

Request body — just the proposal id from the streamed `proposal` event:

```json
{ "proposal_id": "p1" }
```

The full proposal payload (body, kind, depends_on, ddl_statements) is
resolved server-side from the optimizer's per-user proposal cache,
populated by the streaming `/optimize` endpoint. The cache TTL is
1 hour and is process-local — if the FE gets a `404` here, the panel
should silently re-run `/optimize`.

Response (200):

```json
{
  "equivalent": true,
  "slow_duration_ms": 18314,
  "fast_duration_ms":   94,
  "speedup":  194.8,
  "diff_rows": 0,
  "sample_diff": null               // when equivalent=false, ≤10 row sample (each direction)
}
```

Response (404) when the proposal id is no longer cached:

```json
{ "error": "proposal_not_found", "detail": "...re-run /optimize..." }
```

Response (422) for known failure modes (e.g. schema mismatch — different
column count between slow and fast):

```json
{ "error": "schema_mismatch", "detail": "fast has 4 columns, slow has 5" }
```

### Accept

```
POST /api/ee/transform-optimizer/:id/proposal/accept
```

Creates the proposal's transforms (1 for `rewrite` / `index`, N for
`precompute`) in `depends_on` order. The DDL list is returned for the
user to inspect / copy — Metabase does **not** execute DDL in this branch.

Request body — just the proposal ids from the streamed `proposal` events,
in dependency order (single rewrites: one id; precompute DAGs: N ids,
roots first):

```json
{
  "proposal_ids":  ["p1", "p2", "p3"],
  "collection_id": 42                    // optional, defaults to the source transform's collection
}
```

Server resolves each id against the optimizer's per-user proposal
cache. If any id is missing, the **entire request** fails with `404
proposal_not_found` listing the missing ids — there is no partial
accept.

Response (200):

```json
{
  "created_transforms": [
    { "id": 88,  "name": "Original — customer_first_purchase",   "proposal_id": "p1", "kind": "precompute", "depends_on": [] },
    { "id": 89,  "name": "Original — customer_monthly_activity", "proposal_id": "p2", "kind": "precompute", "depends_on": [] },
    { "id": 90,  "name": "Original — cohort_retention",          "proposal_id": "p3", "kind": "precompute", "depends_on": ["p1","p2"] }
  ],
  "advisory_ddl": [
    {
      "id": "ddl1",
      "proposal_id": "p1",
      "statement": "CREATE INDEX IF NOT EXISTS idx_cfp_customer_id ON shop.customer_first_purchase (customer_id);",
      "target": { "precompute-of": "p1" },
      "rationale": "Join key for the final query.",
      "validation": "accepted",
      "index_name": "idx_cfp_customer_id"
    }
  ],
  "skipped_proposals": []   // proposal ids that had no SQL body (kind=index); they appear here, plus their DDL is in advisory_ddl
}
```

---

## Parallelisation notes

- **FE walking skeleton is live** against the wire contract. The SSE parser
  in `api/stream.ts` is contract-driven and decoupled from any specific
  backend implementation — keep the contract stable and the panel will keep
  working if BE event shapes change downstream.
- **Verify/accept** are wired to RTK Query against `EnterpriseApi`. Until
  BE-6 (persistence) lands, the panel re-runs the optimizer on each open;
  proposals are kept in component state for the lifetime of the page.
- **BE-4 (verify)** is independent — can be built and tested in
  isolation against the existing query pairs (Phase 0 harness already
  validates exactly the EXCEPT-ALL equivalence form we'll use).
- **BE-7 (module config)** has no dependencies; can be done at any time
  but should land *before* the first CI run that touches kondo.

## Where to read more

- [`PLAN.md`](./PLAN.md) — design rationale, scope, open questions
- [`harness/README.md`](./harness/README.md) — running the validation harness
- [`queries/00_index.md`](./queries/00_index.md) — table of pairs
- `resources/transform_optimizer/prelude.md` — the static LLM system prompt
