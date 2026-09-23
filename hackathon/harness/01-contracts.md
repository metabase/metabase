# Contracts

Four frozen interfaces. Everything else is free to change. Agents must not redefine these; if one is
wrong, change it here and tell the other agents.

---

## §1 Engine contract — for Libor and Paolo

**Send this today.** An engine that implements these multimethods is picked up by the harness, the
search API, the indexer and the UI with no harness-side adapter at all.

Namespace `metabase.search.engine` (`src/metabase/search/engine.clj`). Register with a keyword under
the `search.engine` namespace, e.g. `:search.engine/sqlite-vec1`, `:search.engine/lucene`.

### Required

```clojure
;; Capability check ONLY — app-db type, premium features, infrastructure present.
;; Must NOT read the search-engine setting. Registering this is what makes the engine "known".
(defmethod search.engine/supported-engine? :search.engine/sqlite-vec1 [_] ...)

;; Reducible of search results, ordered best-first.
(defmethod search.engine/results :search.engine/sqlite-vec1 [search-ctx] ...)

;; Models with at least one hit for this query.
(defmethod search.engine/model-set :search.engine/sqlite-vec1 [search-ctx] ...)

;; Index maintenance. update! takes a reducible of documents; delete! takes a model + ids.
(defmethod search.engine/init!   :search.engine/sqlite-vec1 [_ opts] ...)
(defmethod search.engine/update! :search.engine/sqlite-vec1 [_ document-reducible] ...)
(defmethod search.engine/delete! :search.engine/sqlite-vec1 [_ model ids] ...)
```

### Recommended

```clojure
;; Engines whose index you also need. The semantic engine declares [:search.engine/appdb]
;; because it mixes appdb results in and falls back to them.
(defmethod search.engine/dependencies :search.engine/sqlite-vec1 [_] [:search.engine/appdb])

(defmethod search.engine/reindex!             :search.engine/sqlite-vec1 [_ opts] ...)
(defmethod search.engine/reset-tracking!      :search.engine/sqlite-vec1 [_] ...)
(defmethod search.engine/sync-from-restored-db! :search.engine/sqlite-vec1 [_] ...)
(defmethod search.engine/diagnose             :search.engine/sqlite-vec1 [ctx model id] ...)
```

Copy the shape from `src/metabase/search/semantic/core.clj` — it is the smallest complete example.

### Result row shape

Each result must carry at least, so the harness can identify and score it:

| Key | Type | Notes |
|---|---|---|
| `:model` | string | `"card"`, `"dashboard"`, … |
| `:id` | number | entity id |
| `:name` | string | |
| `:score` | number | total score, used for ordering. `/api/search` never shows it: serialization drops it |
| `:all-scores` | seq of maps | `{:name :score :weight :contribution}` per scorer. **Effectively required**, see checklist item 5 |

> **Amended (Agent A, BL-10):** there is no single "score in 0..1". A result's visible score is the sum of its
> scorers' `:contribution`s (appdb and semantic give totals like 12.4 or 117.4, not 0.83), and in-place emits none.
> The harness derives each result's score the same way for every engine: sum of `:contribution` in `:all-scores`.

### Checklist for engine authors (Agent A, BL-10)

Verified against this branch's code. Each item says what breaks if you skip it.

1. **Get loaded at startup.** Require your engine namespace from `src/metabase/search/init.clj` (OSS) or from
   the EE init. `known-engines` is just "keys of `supported-engine?` methods", so an engine whose namespace was
   never loaded doesn't exist: `/api/search?search_engine=x` answers 400 "Unknown search engine".
2. **Name it `:search.engine/<name>`, and enable it at boot.** Pass it as `search_engine=<name>`.
   `additional-search-engines` is an *internal* setting: the API refuses to write it, so set
   `MB_ADDITIONAL_SEARCH_ENGINES=<name>` in the environment when Metabase starts. Without it, the API answers 400
   "not enabled". `supported-engine?` is a capability check only (app-db type, feature flags, infrastructure):
   never read the search-engine settings inside it.
3. **Filter collection permissions yourself. This is the one that leaks.** After your `results`,
   `impl.clj` runs `normalize-result` → `check-permissions-for-model`, but for **cards, dashboards,
   collections, documents** (the `:default` / `:document` methods) that check returns `true` unless searching
   archived items. It assumes the engine already filtered by collection permissions in its query. appdb does
   this in SQL; semantic does it in Clojure after the store query (`semantic_search/index.clj:980-1046`). Reuse
   that code. The harness's golden scenario `empty-04` fails if items from a restricted collection come back.
4. **Carry the fields the post-checks and the response need.** Rows become Toucan instances of the model's
   table and go through `can-read?`/`can-query?` (tables: `database_id`; metrics, segments, measures,
   databases: whatever `mi/can-read?` reads, e.g. `collection_id`, `table_id`, `database_id`, `archived`),
   then hydration and `serialize` (`collection_id`, `collection_name`, `dashboard_id`, `archived_directly`,
   `display_name`, …). The simplest correct approach: store the ingestion document's fields verbatim at
   `update!` time and return them unchanged, as appdb does.
5. **Emit `:all-scores`.** Ranking uses your `:score` (the default `search.engine/score` method), but the API
   response only shows `:all-scores`. Without it, every result shows score 0 in the harness and the UI.
   Include a `:contribution` per scorer.
6. **Honour the search-context filters** listed under "Rules" below (`archived?`, `models`, `created-by`, …,
   the canonical list is `filter-conditions` in `semantic_search/index.clj:628`). Otherwise the engine returns
   rows the other engines filter out, and fairness breaks.
7. **Keep index storage per instance.** The harness boots several instances side by side (different ports,
   app DBs and embedders). A SQLite file or Lucene directory at a fixed path would be shared and corrupted.
   Derive the path from instance config (e.g. next to the app DB) or make it configurable via an env var, and
   tell us the name.
8. **Cosine cutoff: vector arms only.** The `0.7` max cosine distance is a *vector* rule. It has no meaning for
   BM25. A lexical engine shouldn't invent an equivalent cutoff, and a hybrid engine applies `0.7` only to its
   vector arm. State what you apply; the harness records it per run.
9. **Say whether you backfill.** The baseline `semantic` engine tops up with appdb results whenever fewer than
   `semantic-search-min-results-threshold` (default **100**) remain (`semantic_search/core.clj:112`), so the
   "semantic" column is mostly semantic plus appdb. The harness also measures `semantic-pure` (threshold 0). If
   your engine backfills, say so, and ideally make it switchable.
10. **Give the harness a way to know you're ready and what you indexed.** The harness measures from outside.
    Before querying it needs (a) "indexing done", and (b) your indexed `(model, id)` set, to verify every engine
    indexed the same corpus (§5 rule 1). Any of: an admin status endpoint like `/api/ee/semantic-search/status`
    (`indexed_count`, `total_est`), a SQL query the harness can run against your store, or a JSON file of
    `[{model, id}]` written after each index pass. Without this, your column is recorded as "corpus unverified".
11. **Return best-first, and don't truncate early.** `results` is a reducible ordered best-first. The pipeline
    takes up to `search.config/*db-max-results*`, applies permissions, then keeps the top
    `max-filtered-results`. Cutting to a small N yourself means permission filtering can leave you with too few.

### Turning it on

```bash
MB_ADDITIONAL_SEARCH_ENGINES=sqlite-vec1,lucene   # keeps them indexed and queryable
curl '.../api/search?q=orders&search_engine=sqlite-vec1'
```

`/api/search` refuses an engine absent from `additional-search-engines`
(`src/metabase/search/api.clj:71`), so this env var is mandatory, not optional.

### Rules that keep the comparison fair

- Honour every filter in the search context: `archived?`, `models`, `created-by`, `last-edited-by`,
  `table-db-id`, `ids`, `display-type`, `filter-items-in-personal-collection`, date ranges. The
  canonical list is `filter-conditions` in `semantic_search/index.clj:628`.
- Apply permission filtering. The semantic engine does it in Clojure after the store query
  (`index.clj:980-1046`); reuse that path rather than inventing one.
- Use the same embedding model the instance is configured with — `semantic.embedding/get-configured-model`.
  Do not hardcode dimensions.
- Use the same `0.7` cosine cutoff and the same results limit as the baseline, or the numbers are not
  comparable. The cutoff is a constant (`max-cosine-distance`, `index.clj:716`); the limit is the internal setting
  `semantic-search-results-limit` (default 1000). Vector arms only: see checklist item 8.

---

## §2 Adapter interface — harness-internal

> **Amended (Agent A):** TypeScript, HTTP-only, measured from outside Metabase. The original Clojure
> protocol and in-process adapter are dropped. The runner lives in `hackathon/harness/runner/` (Node ≥ 22.18).

The runner talks to this, never to a store. One implementation: `GET /api/search?search_engine=…`
against a running instance, as a non-superuser.

```ts
interface SearchAdapter {
  /** Engine column, e.g. "sqlite-vec1". Also the `search_engine` param value. */
  id: string;
  /** Can this adapter serve queries right now? Probes /api/search; a 400 means "not in additional-search-engines". */
  ready(): Promise<{ ready: boolean; reason: string }>;
  /** Provenance, recorded on the run. */
  describe(): Promise<{ engine: string; embedder: string; dimensions: number | null; indexSize: number | null }>;
  /** Execute one query. MUST NOT time itself — the runner does the timing. */
  runQuery(scenario: Scenario, opts: { models?: string[]; limit?: number }): Promise<{
    results: { model: string; id: number; name: string; score: number; allScores: unknown[] }[];
    rawCount: null;            // not observable over HTTP
    error: string | null;
  }>;
}
```

`score` is the sum of the per-scorer `contribution`s in the response's `scores`, because `/api/search`
drops the total. The runner owns warmup, iteration and timing, so every column is measured the same
way. `latency_ms` is client-observed wall time, including HTTP and JSON. That overhead is the same for
every engine. `embed_ms` / `store_ms` / `filter_ms` / `raw_count` are NULL: they are only observable
inside the JVM, or as a superuser (`vector_search_explain`).

The adapter rejects any response whose `engine` differs from the one requested, because Metabase falls
back to other engines silently in several places.

---

## §3 Scenario format

> **Amended (Agent A):** JSON, not EDN, so the TS runner and writer read it without a parser. Same
> fields, in camelCase to match D's `Scenario` type in `results/src/writer.ts`.

One JSON file, an array of objects. `hackathon/harness/scenarios/*.json`.

```jsonc
{
  "id": "rev-paraphrase-01",                 // stable, referenced by results rows
  "query": "how much money did we bring in",
  "tags": ["paraphrase", "revenue"],         // see categories below
  "lang": "en",                              // "pl" / "ja" for cross-lingual cases
  "expected": [
    { "model": "card",      "id": 12, "grade": 2 },   // grade 2 = highly relevant
    { "model": "dashboard", "id": 3,  "grade": 1 }    // grade 1 = relevant
  ],
  "expectedAbsent": [{ "model": "card", "id": 88 }],  // optional explicit negatives
  "notes": "no lexical overlap with the target"
}
```

`grade` feeds nDCG. Treat any positive grade as relevant for recall and precision.

> **Amended (Agent B) — labels are authored against stable keys, not ids.** Ids change whenever a
> corpus is re-applied, so authored files live in `scenarios/src/*.json` and reference corpus keys
> (`{"ref": "card/net-revenue-by-channel", "grade": 2}`). `corpus-gen/resolve.ts` turns them into the
> shape above using the manifest `corpus-gen/apply.ts` wrote for *that* instance, and fails on any ref
> it cannot resolve. Resolved items keep an extra `"ref"` field for the drill-down. Only resolved
> files sit directly in `scenarios/`, so a runner globbing `scenarios/*.json` never sees raw refs.
> Pipeline: `generate.ts` → apply `warehouse.sql` → `apply.ts` (→ `manifest.json`) → `resolve.ts`.
> See `corpus-gen/README.md`.

**Categories.** Tag every scenario with at least one. The point is that different engines should win
different categories — one aggregate number hides the whole story.

| Tag | What it probes | Expected winner |
|---|---|---|
| `:exact-name` | verbatim title match | keyword |
| `:rare-token` | ids, codes, table names | keyword |
| `:paraphrase` | same meaning, no shared words | semantic |
| `:concept` | business concept → several entities | semantic |
| `:typo` | misspelling | semantic |
| `:cross-lingual` | query language ≠ content language | semantic only |
| `:ambiguous` | legitimately several right answers | — |
| `:empty-expected` | should return nothing | precision check |

---

## §4 Results schema

Postgres. Reuse the running pgvector container, separate database `harness`:

```bash
docker exec semantic_search-postgres-1 createdb -U postgres harness
```

Long format, so the Metabase data app can slice without pivoting.

```sql
CREATE TABLE harness_run (
  run_id       text PRIMARY KEY,          -- ULID or timestamp-slug
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz,
  git_sha      text,
  branch       text,
  data_scale   int,                       -- dev.search-perf :data-scale
  corpus_id    text,                      -- which scenario set / corpus
  host         text,
  notes        text
);

-- one row per (engine, embedder, scenario, iteration) — raw observations
CREATE TABLE harness_query_result (
  run_id        text REFERENCES harness_run(run_id),
  engine        text NOT NULL,            -- 'semantic' | 'sqlite-vec1' | 'lucene' | 'appdb' | 'in-place'
  embedder      text NOT NULL,            -- 'ollama/all-minilm'
  dimensions    int,
  scenario_id   text NOT NULL,
  iteration     int NOT NULL,
  latency_ms         double precision,
  embed_ms           double precision,    -- from the time-waterfall where available
  store_ms           double precision,
  filter_ms          double precision,
  result_count  int,
  raw_count     int,                      -- before permission/collection filtering
  returned      jsonb,                    -- [{"model":"card","id":12,"name":"…","score":117.4}, ...] in rank order; score = sum of contributions
  error         text,
  PRIMARY KEY (run_id, engine, embedder, scenario_id, iteration)
);

-- one row per computed metric — long format
CREATE TABLE harness_metric (
  run_id       text REFERENCES harness_run(run_id),
  engine       text NOT NULL,
  engine_b     text,                      -- NULL except for pairwise metrics (jaccard, kendall_tau,
                                          -- rank_displacement): the engine compared against. Added by
                                          -- Agent C; heatmap = pivot engine × engine_b.
  embedder     text NOT NULL,
  scenario_id  text,                      -- NULL for run-level aggregates
  tag          text,                      -- NULL for untagged / aggregate rows
  metric       text NOT NULL,             -- 'recall@10' | 'ndcg@10' | 'p95_ms' | 'zero_result_rate' | ...
  value        double precision NOT NULL
);

CREATE INDEX ON harness_metric (run_id, metric);
CREATE INDEX ON harness_query_result (run_id, engine);

-- ADDED (Agent D): the labels a run was scored against, so the data app can slice by tag and show the query
-- text / expected items in the drill-down. Keyed by run, not corpus: entity ids differ per instance, so two runs
-- of one corpus can carry different expected ids (Voytek, via Agent A). Written by the runner right after
-- startRun via recordScenarios(runId, scenarios) in hackathon/harness/results/src/writer.ts; the corpus id is
-- taken from the run. Idempotent on (run_id, scenario_id).
CREATE TABLE harness_scenario (
  run_id           text NOT NULL REFERENCES harness_run(run_id),
  corpus_id        text NOT NULL,         -- copied from harness_run.corpus_id
  scenario_id      text NOT NULL,         -- §3 :id
  query            text NOT NULL,
  tags             text[] NOT NULL,       -- §3 :tags, without the leading colon: {'paraphrase','revenue'}
  lang             text,
  expected         jsonb,                 -- §3 :expected, verbatim
  expected_absent  jsonb,
  notes            text,
  PRIMARY KEY (run_id, scenario_id)
);```

> **Amended (Agent E):** `harness_run` gets `embedding_text text NOT NULL DEFAULT 'baseline'`, the
> value of `GET /api/setting/search-embedding-text-variant` at run start. One run = one variant, like the
> embedder. The data app slices axis 4 by joining `harness_metric` / `harness_query_result` to
> `harness_run` on `run_id`. Runs made before this column existed are `baseline` by construction.
>
> ```sql
> ALTER TABLE harness_run ADD COLUMN IF NOT EXISTS embedding_text text NOT NULL DEFAULT 'baseline';
> ```

`harness_run.embedder` (Agent D): the run's single embedder (§5.2). The writer stamps it from the first
`recordQueryResults` batch (or takes `RunInfo.embedder`) and rejects batches naming another embedder.
`data_scale` is NULL for runs that are not a scale tier (e.g. the golden set); the data app handles that.

Rules: never overwrite a run; a re-run gets a new `run_id`. `returned` keeps rank order so agreement
metrics can be recomputed later without re-running anything.

Metric-name conventions for `harness_metric.metric` (the data app filters on these exact strings):
`recall@10`, `precision@10`, `ndcg@10`, `mrr`, `zero_result_rate`, `ann_recall@10`, `p50_ms`,
`p95_ms`, `p99_ms`. Per-scenario quality rows (`scenario_id` set, `tag` NULL) are what the data app
uses for tag slices and distributions — emit them, not only aggregates. Pairwise agreement
(`jaccard@10`, `kendall_tau`, `rank_displacement`) is stored with `engine_b` set; the data app can
also recompute Jaccard from `returned`, so a run without stored pairwise rows still gets a heatmap.

`unscored_rate` is 0/1 per (engine, embedder, scenario): 1 when every iteration errored, so that scenario has no quality
rows. Its run-level and per-tag means are the share of questions missing from that engine's quality averages. Runs
recorded before it existed don't have it: treat a missing value as unknown, not 0.

`ann_recall@10` is **not emitted** in the harness's HTTP-only mode. It needs an exact brute-force reference engine to
compare against (`annReference` in `metrics.ts`), and no search endpoint exposes one over the API. It becomes
available once an exact-search endpoint exists, or an in-process probe runs the same query both ways.

Agreed with Agent C: `zero_result_rate` (0/1 per scenario) is emitted only for scenarios with a
non-empty `:expected`. `:empty-expected` scenarios instead get `false_positive_rate` (1 = returned
anything) and no recall/precision/mrr/ndcg rows (undefined there), so a plain AVG over per-scenario
rows is the correct headline. Further names: `kendall_tau_n` (overlap size tau was computed over,
`engine_b` set), and run-level latency stage shares `embed_share`, `store_share`, `filter_share`,
`other_share`. Rows with a nil value are never emitted.

`permission_leak` (Agent C): 0/1 per scenario, emitted only for scenarios with a non-empty
`expectedAbsent` (items the harness user must not be able to read); 1 if any of them appears anywhere in
the results. Any non-zero value is an engine permission-filtering bug; the data app flags it in red.

`returned` elements may also carry `"name"` (entity name); the writer keeps it when present so the
drill-down can show names. Rank order is the array order.

---

## §5 Fairness rules — enforced, not aspirational

The runner's preflight refuses to start unless all of these hold. Agent A owns this.

1. **Same corpus.** Every engine reports the same indexed document count, and the same
   `(model, id)` set. Assert it, do not assume it.
2. **Same embedder within a run.** Engines share `semantic.embedding/get-configured-model`. An
   embedder change means a new run, not a new column.
2a. **Same embedding text within a run** (Agent E). `search-embedding-text-variant` is read at run
   start and recorded on `harness_run.embedding_text`. The runner re-reads it at the end; a change
   in between fails the run.
3. **Same cutoff and limit.** `0.7` and `semantic-search-results-limit` identical across engines.
4. **Same filters and same user.** One non-superuser with a fixed permission set, so permission
   filtering is exercised identically. `search-perf/create-test-environment!` already makes suitable
   users.
5. **Warmup.** Discard the first N iterations per (engine, scenario); JIT and cold connection pools
   otherwise dominate. The pgvector pool holds zero idle connections by default.
6. **Cache state declared.** Either warm every engine identically or record cold/warm on the run.
7. **Pinned seed** for corpus generation, recorded in `harness_run.notes`.
8. **Record what actually ran**: git sha, branch, engine versions, index sizes, scorer set applied.

A run that cannot satisfy 1–4 is reported as a failed run, not quietly published.

> **Amended (Agent A): what an outside-in preflight can actually check.** Every rule is either
> *verified* (checked; violation blocks the run unless `--force`) or *declared* (recorded in
> `harness_run.notes` as unverifiable).
>
> | Rule | Status | How |
> |---|---|---|
> | 1 same corpus | verified **where observable**, else declared | Each engine config may supply a `corpus()` probe returning its `(model,id)` set. The pgvector baseline gets one via SQL on the active index table. appdb (H2, locked by the running instance) and in-place (no index) have none, and are recorded as `unverified`. **Libor/Paolo: a probe for your store is welcome, e.g. a SQL query or a file of ids.** Every probed engine must match every other. |
> | 2 same embedder | verified | `/api/session/properties` → `ee-embedding-provider/model/model-dimensions`, recorded on the run |
> | 3 cutoff + limit | declared | `0.7` is a code constant and the results limit is an env var the API doesn't expose |
> | 4 non-superuser | verified | `/api/user/current` → `is_superuser = false` |
> | engine enabled | verified | `/api/search?search_engine=X` answers 200, not 400 |
> | 5 warmup | enforced by the runner | |
> | 6–8 | recorded | cache state, seed, git sha/branch go in `harness_run` |
>
> The harness user is created by the runner's `setup` step through the admin API (non-admin, All Users
> group only).
