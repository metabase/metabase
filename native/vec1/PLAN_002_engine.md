# PLAN 002 — SQLite store as the semantic search engine, end to end

Part of [PLAN.md](PLAN.md) (the wiring half of iteration 1). Builds on the store from
[PLAN_001_store.md](PLAN_001_store.md) (`metabase-enterprise.semantic-search.sqlite`).

**Goal:** start Metabase on an **empty app DB** with one extra env var, and have the normal search (UI
command palette / search page, `/api/search`) index into and query the SQLite store — no pgvector anywhere.

**Done when:** fresh start → setup wizard → the store is created and filled on its own → a search whose
words appear nowhere in a card's name/description finds that card in the UI → creating / renaming /
archiving / deleting a card shows up in search within seconds → restart reuses the store → unsetting the
env var brings back today's behaviour.

**Not in this plan:** hybrid keyword + vector ranking, the pgvector scorers (recency, view count, …) —
that's PLAN.md iteration 2 (reuse `query-index`). Here ranking = semantic distance + the app-DB scorers
(bookmarks, recent views) that semantic search already applies.

---

## How search picks and feeds the semantic engine today (traced 2026-09-23)

- **Selection** — `metabase.search.engine`: default order `[semantic appdb in-place]` (`engine.clj:10-15`);
  `default-engine` = first *supported* one (`:200-210`). So semantic is used for every normal search as soon
  as `supported-engine?` is true; nothing opts in. `MB_SEARCH_ENGINE` overrides (opt-out).
  `active-engines` = default + additional + dependencies (semantic depends on appdb, so appdb is indexed too).
- **`supported?`** (EE `semantic_search/core.clj:45-54`) = `:semantic-search` token feature
  (`defenterprise :feature`) **and** `semantic-search-available?` (feature + pgvector configured — may probe
  the app DB) **and** `embedding-supported?` (local config check of the provider).
- **Startup** — `search/task/search_index.clj:64-72` starts a thread that calls `search/init-index!` →
  `search.engine/init!` for each active engine → EE `init!` (`core.clj:186-195`): migrate + gate every
  document (sync); embedding happens later in the Quartz indexer.
- **Updates** — models with `:hook/search-index` → `search/update!` → ingestion queue → `ingestion/update!`
  (`ingestion.clj:214-240`) → `search.engine/update!` (batches of 150) / `delete!` for **active engines only**.
  Both must return `{model count}` (merged with `+` for logging/metrics). Deleted rows become deletes.
- **Query** — EE `results` (`core.clj:96-143`): `pgvector-api/query` → `{:results :raw-count}`; fewer than
  `semantic-search-min-results-threshold` (default **100**) results → appended app-DB results (deduped);
  any exception → app-DB fallback.
- **pgvector-only background work** — indexer, repair, cleanup, metric collector, usage trimmer, store
  health: all *scheduled* only when `semantic-search-configured?` (feature + `MB_PGVECTOR_DB_URL` set or
  Postgres app DB); cleanup / usage trimmer / status API / entity retrieval *run* on `semantic-search-available?`.
  `build-hnsw-index-async!` runs on `semantic-search-active?`.

## Design

One switch: `sqlite/enabled?` (`MB_SEMANTIC_SEARCH_SQLITE_PATH` set). When on:

- **The engine is supported without pgvector** (`supported?` takes a SQLite branch).
- **Everything pgvector is off**: `semantic-search-configured?` and `semantic-search-available?` return
  false, so no pgvector task is scheduled, no probe of the app DB, no status/entity-retrieval use of the
  datasource. `build-hnsw-index-async!` no-ops.
- **The five engine entry points in `core.clj` call the store** instead of `pgvector-api`, forking at the
  call site so `results`' threshold / fallback / dedupe logic is reused unchanged.

`sqlite/enabled?` must stay cheap (env read only): `supported-engine?` runs on every search.

---

## Phase A — gating ✅ done 2026-09-23

`semantic_search/util.clj`, `core.clj`:

- [x] `semantic-search-configured?` → `false` when `(sqlite/enabled?)` (no pgvector task gets scheduled).
- [x] `semantic-search-available?` → `false` when `(sqlite/enabled?)` (cleanup, usage trimmer, status API,
      entity retrieval stay off the pgvector datasource).
- [x] **Namespace cycle** (verified): `index` requires `util` and `sqlite` requires `index`, so `util` can't
      require `sqlite`. Move `db-path` / `enabled?` into a new dependency-free
      `metabase-enterprise.semantic-search.sqlite-config`, required by `util`, `core` and `sqlite`
      (`sqlite` keeps thin aliases so existing callers and tests don't change). Run `./bin/mage fix-modules-config`.
- [x] `supported?` → `(if (sqlite/enabled?) (embedding-supported? …) (and (available?) (embedding-supported? …)))`.
      The `:semantic-search` feature check stays (it's the `defenterprise :feature`).
- [x] `build-hnsw-index-async!` → no-op when `(sqlite/enabled?)` (reachable via the vector-strategy setting event).
- [x] REPL check: with the env var set, `(search.engine/supported-engines)` starts with `:search.engine/semantic`,
      `(search.engine/active-engines)` = `[semantic appdb]`, and `(semantic.util/semantic-search-configured?)` is false.
      Verified in the dev REPL (Postgres app DB with pgvector): without the env var semantic runs on pgvector as
      before; with it, semantic is still supported / default / active and both pgvector gates are false.
- [x] Test: `sqlite_engine_test.clj` `gating-test` (test app DB initialised; the store unit tests don't need one).

## Phase B — write hooks (1–2 h)

`core.clj` `init!`, `update-index!`, `delete-from-index!`, `repair-index!`; store additions in `sqlite.clj`.

- [ ] `init!` [documents opts] → `(sqlite/open!)` (configured model; a model change recreates the store),
      `(sqlite/delete-store!)` first when `(:force-reset? opts)`, then `(sqlite/index-all-async! documents)`.
      Async: startup must not wait for embedding every document (same as pgvector, where the indexer embeds
      later). Searches before it finishes get fewer results → app-DB fallback fills in.
      *Check:* `searchable-documents` is a reducible over an app-DB query — fine to realize on the future's thread.
- [ ] **Prune on full index**: `index-all!` currently leaves docs that vanished while Metabase was down.
      Add `:prune? true` for `init!`: collect the `[model model_id]` keys seen, then delete every other row
      (`delete-documents!` per model). Cheap at hackathon sizes. Test it.
- [ ] `update-index!` [documents] → `(sqlite/upsert-documents! documents)`; return `{model count}` of the
      upserted docs (frequencies of `:model`), not the store's `{:upserted …}` counts.
- [ ] `delete-from-index!` [model ids] → `(sqlite/delete-documents! model ids)`; return `{model n}`.
- [ ] `repair-index!` → in SQLite mode `index-all!` with `:prune? true`, return
      `{:index-id 0 :orphans <pruned> :snapshot-at (Instant/now)}`. (Not scheduled in SQLite mode — the repair
      task is pgvector-gated — but keep the contract for direct callers.)
- [ ] `diagnose` → `{:type :missing-from-index :details {:reason :sqlite-store}}` (or a present/absent
      answer via `sqlite/get-doc` if cheap).

## Phase C — query: `sqlite/query` [search-ctx] → `{:results :raw-count}` (3–4 h)

The standalone query from PLAN.md 1.4, on top of `sqlite/search-text`.

- [ ] Blank `:search-string` → `{:results [] :raw-count 0}` (core then falls back — same as pgvector).
- [ ] Map search-ctx filters (names from `index.clj` `filter-conditions`):
  - inside the KNN (vec1 meta columns): `:models` → `:models`; `:archived?` → `:archived?`;
    `:verified` → `:verified?`; `:created-by` → `:creator-ids`; `:table-db-id` → `:database-ids [id]`.
  - after the KNN, in Clojure (may return fewer than k): `:ids`, `:display-type`, `:last-edited-by`,
    `:created-at` / `:last-edited-at` ranges, `:curated?`, personal-collection filter. Hackathon: implement
    `:ids` and `:display-type`; log-and-ignore the rest (list them in the code).
- [ ] `k` = `(semantic-search-results-limit)` (1000).
- [ ] **Distance cutoff** — needed, or every search returns the whole index (k ≥ doc count). pgvector's 0.7
      drops 3 of 8 correct paraphrase hits with this model (PLAN_001 acceptance: hits at 0.55–0.84).
      Start with a constant `max-distance` = 0.8, overridable by env `MB_SEMANTIC_SEARCH_SQLITE_MAX_DISTANCE`;
      tune in Phase E with `paraphrase-check` + a few unrelated queries (e.g. "weather forecast" should
      return little or nothing).
- [ ] Row → result: `(assoc legacy_input :score s :all-scores [{:name :semantic-distance :score s :weight w
      :contribution (* w s)}])` with `s = 1 - distance/2` (same linear map as `scoring.clj`
      `semantic-distance-score-expr`), `w = (search.config/weight search-ctx :semantic-distance)`.
- [ ] Reuse the pgvector post-processing, in this order (as in `index.clj` `query-index`):
      `filter-read-permitted` → `apply-collection-id-filter` → `(mapv search/collapse-id)` →
      `scoring/with-appdb-scores`. The first two are private in `index.clj` → make public (hackathon).
- [ ] `:raw-count` = row count before permission filtering (core uses it to decide whether to fall back).
- [ ] `core.clj` `results`: replace only the `(semantic.pgvector-api/query …)` call with
      `(if (sqlite/enabled?) (sqlite/query search-ctx) (semantic.pgvector-api/query …))`.

## Phase D — tests (2–3 h)

- [ ] `sqlite_test.clj` (or `sqlite_engine_test.clj`): `query` with stub embeddings — filter mapping, cutoff,
      blank string, permission filter drops unreadable docs (needs `mt/with-temp` cards + a test user →
      initialise the test app DB for this ns).
- [ ] Engine-level: with `sqlite/db-path` redef'd to a temp file and the `:semantic-search` feature
      (`mt/with-premium-features #{:semantic-search}`), `(search.engine/supported-engine? :search.engine/semantic)`
      is true, `semantic-search-configured?` false; `update-index!` / `delete-from-index!` round trip returns
      `{model n}`; `init!` + prune.
- [ ] API-level smoke: `mt/user-http-request :crowberto :get 200 "search" :q "…" :search_engine "semantic"`
      returns the stubbed-nearest card first.

## Phase E — run it end to end (1–2 h)

### Setup

```bash
# fresh, throwaway app DB (H2); delete the files to start over
export MB_DB_TYPE=h2
export MB_DB_FILE=/tmp/mb-sqlite-e2e/metabase          # H2 appends .mv.db
export MB_SEMANTIC_SEARCH_SQLITE_PATH=/tmp/mb-sqlite-e2e/semantic.db
# unchanged from today's dev setup:
#   MB_PREMIUM_EMBEDDING_TOKEN   token with the semantic-search feature
#   MB_EE_EMBEDDING_SERVICE_BASE_URL (+ MB_EE_EMBEDDING_SERVICE_API_KEY)   or  MB_EE_EMBEDDING_PROVIDER=openai + key
# must NOT be set: MB_PGVECTOR_DB_URL, MB_SEARCH_ENGINE
# optional: MB_VEC1_EXTENSION_PATH (default: resources/vec1/<platform>/ on the classpath)
clojure -M:run:ee:dev      # or start the dev REPL with these env vars and (dev/start!)
```

Env vars are read at JVM start (`environ`): set them before starting the REPL. H2 keeps the app DB free of
pgvector by construction; a fresh Postgres app DB also works once Phase A is in (nothing probes it).

### Checklist

- [ ] Log shows `Opened SQLite semantic search store at … (created)` and `SQLite semantic index: {…}` counts;
      no log line mentions pgvector / `semantic_search` schema / HNSW.
- [ ] Setup wizard → Sample Database synced → `sqlite/stats` doc count matches `search.ingestion/search-items-count`.
- [ ] REPL: `(search.engine/default-engine)` = `:search.engine/semantic`.
- [ ] UI search for a paraphrase (e.g. "income across american regions") → "Revenue by state" at the top;
      `/api/search?q=…` result carries `:all-scores` with `:semantic-distance`.
- [ ] Create a card "Customer churn by cohort" → searchable by "clients leaving over time" within seconds;
      rename → new name found; archive → gone from normal search, present with archived filter; delete → gone.
- [ ] Unrelated query ("weather forecast") → few or no semantic hits (cutoff works); app-DB fallback may add
      keyword hits.
- [ ] Restart → `(existing)` in the log, indexing reuses vectors (fast), prune removes nothing.
- [ ] Kill switch: unset `MB_SEMANTIC_SEARCH_SQLITE_PATH`, restart → semantic unsupported without pgvector,
      search uses appdb as before.
- [ ] Record: doc count, initial index time, search latency (embedding vs knn), cutoff chosen.

---

## Risks / open questions

- **Cutoff value** is model-specific; 0.8 is a guess from 8 paraphrases. If it's too loose, results look like
  "everything"; too tight, paraphrases fall back to keyword search.
- **Fallback always kicks in** below 100 semantic results (`semantic-search-min-results-threshold`), so on a
  small instance app-DB keyword results are appended after the semantic ones. Expected; lower the setting to
  see semantic-only results.
- **vec1 crash = whole Metabase down** (LIMITATION_001). All vec1 SQL stays inside `sqlite.clj`.
- **Concurrent writers**: startup `index-all-async!` and update hooks both write; serialized by `with-conn`,
  embedding outside the lock, last write wins — fine.
- **Multi-instance**: each node would have its own file and only see its own updates. Single node only.
- **Token feature**: `:semantic-search` still comes from the premium token; no dev bypass exists (tests use
  `mt/with-premium-features`).
- **Uberjar**: extension resolved from the classpath only as a plain file — works from source/dev, not from
  a built jar (extraction is production work).

## Effort

| Phase | |
|---|---|
| A gating | 1 h |
| B write hooks | 1–2 h |
| C query | 3–4 h |
| D tests | 2–3 h |
| E end to end | 1–2 h |
| **Total** | **~1–1.5 days** |
