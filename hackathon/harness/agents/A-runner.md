# Agent A — matrix runner

Read `_shared-context.md` first.

## Mission

Execute every (engine × embedder × scenario × iteration) cell, collect raw observations, and write
them to `harness_query_result`. Own the fairness preflight that decides whether a run is publishable.

You own: `dev/src/dev/harness/runner.clj`, `dev/src/dev/harness/adapter.clj`,
`dev/src/dev/harness/preflight.clj`, `dev/src/dev/harness/stub_engine.clj`.

## Deliverables

1. **`SearchAdapter` protocol** exactly as in `01-contracts.md` §2, plus two implementations:
   - `in-process-adapter` — builds a search context (copy `search-perf/search-context-for-user`),
     assoc's `:search-engine`, calls `search.engine/results`. This is the default.
   - `http-adapter` — `GET /api/search?q=…&search_engine=…` against a base URL, session from
     `POST /api/session`. Fallback for engines that cannot be merged into one process.
   Both return the same shape. The runner must not care which it holds.

2. **Runner.** `(run-matrix! {:engines [...] :embedders [...] :scenarios [...] :iterations 5 :warmup 2})`
   - Owns timing. Adapters never time themselves.
   - Discards warmup iterations.
   - Captures the per-stage waterfall where available: set `:vector-search-explain? true` on the
     context to populate embed / store / filter splits (`index.clj`, `time-waterfall`). Gate this —
     it re-runs EXPLAIN and inflates totals, so never leave it on for the latency numbers themselves.
   - Writes one `harness_query_result` row per iteration, `returned` preserving rank order.
   - Never aborts the whole run on one failing cell: record `error`, continue.

3. **Fairness preflight** — `01-contracts.md` §5, as executable assertions. Returns
   `{:ok? bool :violations [...]}`. `run-matrix!` refuses to start when 1–4 fail, unless passed
   `:force true` (which stamps the run as non-publishable in `harness_run.notes`).

4. **Stub engine** — `:search.engine/stub`, a trivial engine (e.g. appdb results shuffled with a
   fixed seed). Its only job is to prove the matrix has ≥2 columns and that the runner is engine-
   agnostic before Libor's or Paolo's work lands. Delete it before the demo.

## Verification

- `run-matrix!` over the `appdb` and `in-place` engines with the 65-doc Sample Database corpus
  produces a populated `harness_query_result` and no exceptions. That works today, no new engines
  needed.
- Preflight fails loudly when you point two adapters at deliberately different corpora.
- In-process and HTTP adapters return the same ranked ids for the same query against the same engine.
  This is the single most important test you will write — it validates the fallback path.

## Gotchas

- `/api/search` rejects an engine missing from `additional-search-engines`
  (`src/metabase/search/api.clj:71`). Set `MB_ADDITIONAL_SEARCH_ENGINES` before boot.
- `in-place` returns a reducible that is not seqable — realize with `t2.realize/realize` before
  counting. `semantic_search/core.clj` shows the pattern.
- The pgvector pool holds **zero** idle connections by default, so the first query after any idle
  period pays a connection handshake. This is exactly what warmup is for.
- Run as a **non-superuser** with a fixed permission set so permission filtering actually executes.
  `search-perf/create-test-environment!` creates suitable users.
- Zero results is a legitimate, interesting outcome — record it, never treat it as an error.
