# Transform Optimizer — Implementation Status & Open Tasks

Companion to [`PLAN.md`](./PLAN.md). PLAN describes *what* we're building;
this doc tracks *where we are*. Keep it current — it's the parallel-work
coordination surface.

## Status by phase

### Phase 0 — Foundation ✅ **done**

| Artifact | Path | Notes |
|---|---|---|
| DDL | `dataset/01_schema.sql` | `shop` schema; FKs kept, no helper indexes |
| Seed | `dataset/02_seed.sql` | ~1/5 scale (100k customers, 1M orders, 3M events, 300k reviews) — runs in ~1 min |
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

### Phase 2 — Deterministic plumbing 🟡 **partial** (everything but the LLM call)

| Namespace | File | What it does | Status |
|---|---|---|---|
| `prelude` | `prelude.clj` + `resources/transform_optimizer/prelude.md` | Static system prompt (output schema, severity rubric, DDL constraints, 4 worked examples — one per `kind`). Loaded once and cached. | ✅ |
| `prompt` | `prompt.clj` | Renders context map to markdown for the user-side of the prompt. | ✅ |
| `scoring` | `scoring.clj` | Pure `proposals → optimization_degree` per the rubric (`100 − Σ severity_weights`; high=30, med=15, low=5). | ✅ |
| `ddl.parse` | `ddl/parse.clj` | Allowlist validator. Strips strings/comments, rejects multi-statement, rejects forbidden keywords, regex-matches canonical `CREATE INDEX`, asserts schema-qualified target is in referenced-tables set. | ✅ |
| `core` | `core.clj` | Public entry `optimize!`. Stitches everything together. **LLM call is a stub.** Server-side proposal post-processing (DDL validation tag + scoring) is wired in. | 🟡 LLM stubbed |

### Phase 3 — UI ⛔ **not started**

### Phase 4 — Equivalence verification ⛔ **not started**

### Phase 5 — Polish & guardrails ⛔ **not started**

---

## Open BE tasks

| # | Task | Depends on | Notes |
|---|---|---|---|
| BE-1 | Wire Metabot deftool `propose-transform-optimizations` | — | Replace `core/call-llm-stub`. Tool takes `{transform_id, opts}`, calls `core/build-prompt`, hands the rendered prompt to the Claude client in `metabase.metabot.self.claude`, parses streamed JSON, runs `core/finalise-proposals`. |
| BE-2 | HTTP streaming endpoint `POST /api/transform/:id/optimize` | BE-1 | Reuses Metabot's SSE-streaming-writer-rf. See **Streaming endpoint** below for the wire contract. |
| BE-3 | `GET /api/transform/:id/optimize/proposals` | persistence | Fetch persisted proposals (most recent first). Only needed if we persist; otherwise the panel runs the optimizer each time. |
| BE-4 | `POST /api/transform/:id/optimize/proposal/:pid/verify` | none of BE-1..3 | Equivalence check. Pure server-side work; can be developed in parallel with BE-1. |
| BE-5 | `POST /api/transform/:id/optimize/proposal/:pid/accept` | none | Creates the new transforms in `depends_on` order. DDL is advisory in this branch — *not* executed by Metabase; the response includes the validated DDL list for the user to copy. |
| BE-6 | Persistence model `:model/TransformOptimizerProposal` | none | Liquibase migration + Toucan2 model. Stores the streamed payload + per-DDL `:validation` tags. Optional for the hackathon walking skeleton; required before merge. |
| BE-7 | `clj-kondo` module config entry for `enterprise/transform-optimizer` | none | We currently cross `transforms-inspector`'s API boundary (`context/build-context`); will trip lint until registered. Either add `context` and `query-analysis` to the inspector's `:api` set or re-export them via `transforms-inspector.api`. |
| BE-8 | Tests | BE-1..5 | Per-namespace unit tests. The harness from Phase 0 covers integration (equivalence + speedup) for the corpus of examples. |

## Open FE tasks

| # | Task | Depends on | Notes |
|---|---|---|---|
| FE-1 | "Suggest optimizations" trigger button on transform page | — | Plain button → opens panel + kicks off SSE request |
| FE-2 | Side panel scaffold + open/close state | FE-1 | Two regions: header (dial + summary) + proposal list |
| FE-3 | Optimization-degree dial | mock data | Colour-coded; "Analyzing…" spinner while streaming; collapse-to-✓ when score is 100. Mock against the **Streaming endpoint** contract below. |
| FE-4 | Summary text region | mock data | Lands first (before the first proposal); replaces the spinner |
| FE-5 | Proposal card component | mock data | Severity badge, kind tag, diff/SQL block, rationale, expected speedup |
| FE-6 | "Index changes" subsection on proposal card | mock data | Per-DDL state: pending/running/executed/failed (executed/failed unused this branch — DDL is advisory) + validation status (`accepted` / `rejected` with reason) |
| FE-7 | Per-card actions (accept, verify, dismiss) | BE-4, BE-5 for non-mock | Buttons disabled with tooltip when user lacks write permission |
| FE-8 | Toast / inline error rendering for stream errors | — | Maps `error` events to user-facing messages |

---

## Streaming endpoint — wire contract

Backend exposes one endpoint that streams the optimizer's output. **Frontend
should mock against this contract until BE-1 + BE-2 land.** Mockable with
Mirage / MSW; sample fixture below.

### Request

```
POST /api/transform/:id/optimize
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
POST /api/transform/:id/optimize/proposal/:pid/verify
```

Body: none. The proposal payload (including its `body` and any
`depends_on` precompute bodies) is retrieved server-side from the same
streamed payload the panel rendered.

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

Response (422) for known failure modes (e.g. schema mismatch — different
column count between slow and fast):

```json
{ "error": "schema_mismatch", "detail": "fast has 4 columns, slow has 5" }
```

### Accept

```
POST /api/transform/:id/optimize/proposal/:pid/accept
```

Creates the proposal's transforms (1 for `rewrite` / `index`, N for
`precompute`) in `depends_on` order. The DDL list is returned for the
user to inspect / copy — Metabase does **not** execute DDL in this branch.

Request body:

```json
{
  "collection_id": 42       // where to put the new transforms; optional, defaults to source transform's collection
}
```

Response (201):

```json
{
  "created_transforms": [
    { "id": 88,  "name": "customer_first_purchase",   "kind": "precompute", "depends_on": [] },
    { "id": 89,  "name": "customer_monthly_activity", "kind": "precompute", "depends_on": [] },
    { "id": 90,  "name": "cohort_retention",          "kind": "precompute", "depends_on": [88, 89] }
  ],
  "advisory_ddl": [
    {
      "statement": "CREATE INDEX IF NOT EXISTS idx_cfp_customer_id ON shop.customer_first_purchase (customer_id);",
      "target": { "precompute-of": "p1" },
      "rationale": "Join key for the final query."
    }
  ]
}
```

---

## Parallelisation notes

- **FE can start immediately** against the contract above. Mock with
  artificial 200–500 ms gaps between `summary` → `proposal` → `proposal` →
  `done` so the streaming UX is exercisable.
- **BE-1 + BE-2 are blocking for FE-7 verify/accept actions** but not for
  the panel scaffold, dial, or proposal cards.
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
