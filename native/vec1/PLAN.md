# SQLite (vec1) semantic search — hackathon plan

Branch `hackathon-2026-sqlite-vec1`. Goal: prove the EE semantic search can run on a SQLite file with the
vec1 extension instead of pgvector, as dirty as needed. Production cleanup (store abstraction, async
indexer, multi-node, build matrix) is explicitly out of scope until the idea is confirmed.

Background: packaging is settled (vec1 over sqlite-vec, musl works) — see the "SQLite vec1 Backend" doc,
https://claude.ai/code/artifact/5ec62385-4ab5-4d20-baf6-4aa7506071df. The REPL POC is `dev/src/dev/vec1.clj`.

Sub-plans (concrete checklists):

- [PLAN_001_store.md](PLAN_001_store.md) — store init, indexing, raw queryability (iteration 0 + store half of iteration 1) ✅ complete
- [LIMITATION_001_update_crash.md](LIMITATION_001_update_crash.md) — vec1 `UPDATE` / non-query `distance` segfault
- PLAN_002 (todo) — engine wiring in `core.clj` + search results

Two iterations:

1. **Branch out** — a standalone SQLite path, forked at the top of the EE engine. Proves write → search works
   end to end in the real app.
2. **Reuse** — replace the standalone query with the existing pgvector query machinery (`query-index`,
   hybrid RRF, scorers), so ranking behaves as it does today.

---

## Iteration 0 — vec1 semantics spike (1–2 h, REPL only, `dev/vec1.clj`)

Everything below depends on these answers. Record them here.

- [ ] `DELETE FROM search_vec WHERE rowid = ?` works; re-insert with the same rowid works.
- [ ] Inserts after `rebuild '{index:"flat", distance:"cos"}'` are searchable without another rebuild.
      If not: fallback is `rebuild` after each write batch.
- [ ] Can the KNN be constrained (`WHERE rowid IN (...)` or a join filter) or is it top-k then post-filter?
      Assume post-filter; use a generous k (e.g. 500 — flat mode is exhaustive anyway).
- [ ] `distance` for `cos` has the same range as pgvector `<=>` (0..2, 0 = identical). The 0.7 cutoff
      (`index.clj` `max-cosine-distance`) and the scorer's `cosine-distance-ceiling` 2.0 assume that.
- [ ] HoneySQL can render the vec1 table-valued function in FROM:
      `{:from [[[:search_vec [:lift blob] [:inline "{k: 500}"]] :v]]}` (function names render upper-case —
      fine, SQLite is case-insensitive).
- [ ] FTS5 is compiled into the bundled sqlite-jdbc (`create virtual table t using fts5(...)`) — needed in
      iteration 2.

---

## Iteration 1 — branch out everywhere (≈ 1.5–2 days)

### Principle

Fork as high as possible and touch nothing pgvector-specific (gate, indexer, DLQ, repair, index-metadata,
HNSW, Postgres `migration` table). One new namespace holds all SQLite code.

**But**: the SQLite doc table uses the *same column names* as the pgvector index table
(`index.clj` `index-table-schema`, minus `embedding`, `text_search_vector`,
`text_search_with_native_query_vector`). That costs nothing now and is what makes iteration 2 possible.

### 1.1 Config + connection — new ns `metabase-enterprise.semantic-search.sqlite`

- `enabled?` = env var `MB_SEMANTIC_SEARCH_SQLITE_PATH` is set. Unset = kill switch, pgvector behaviour
  unchanged.
- One long-lived `java.sql.Connection` in an atom, vec1 loaded on open (lift `open-conn` / `->blob` from
  `dev/vec1.clj`). Serialize writes with `locking` — SQLite is single-writer, and a single connection
  sidesteps per-connection extension loading.
- Extension path: hardcode `resources/vec1/<platform>/vec1.<ext>` resolved from the working dir (fine for
  `clojure -M:dev`; uberjar extraction is production work).

### 1.2 "Migration" — SQLite-side DDL, not Liquibase

The SQLite file is not the app DB, so no Liquibase changeset. On open, run idempotent DDL:

```sql
create table if not exists meta (k text primary key, v text);  -- schema_version, model_name, dims
create table if not exists search_doc (
  id integer primary key,               -- = vec1 rowid
  model text not null, model_id text not null,
  collection_id int, personal_owner_id int, creator_id int, database_id int, last_editor_id int,
  name text not null, content text not null, display_type text,
  archived boolean default false, official_collection boolean, pinned boolean, verified boolean,
  collection_type text, root_collection_type text, data_layer text, data_authority text, curated boolean,
  dashboardcard_count int, view_count int,
  created_at text default current_timestamp,
  model_created_at text, model_updated_at text, last_viewed_at text,
  legacy_input text, metadata text,
  unique (model, model_id));
create virtual table if not exists search_vec using vec1(vector);
-- + rebuild '{index:"flat", distance:"cos"}' on first creation
```

If `meta` disagrees with the configured embedding model/dims or `schema_version`: close, delete the file,
recreate. The index is a cache; `init!` refills it. This is the whole migration story for the hackathon.

### 1.3 Write path

- `upsert!` [docs]: batch-embed `:embeddable_text` with `semantic.embedding/get-embeddings-batch`
  (`{:type :index}`), then per doc in one transaction: upsert `search_doc` (on conflict `(model, model_id)`),
  delete + insert `search_vec` at that `id`. Record builder = trimmed copy of `index.clj` `doc->db-record`
  (no tsvector, no embedding, JSON as plain strings; `personal_owner_id` via the same owner lookup).
- `delete!` [model ids]: delete from both tables.
- `init!` [documents]: stream `search.ingestion/searchable-documents` in batches of ~100 through `upsert!`,
  in a `future` (startup must not block on embedding the whole instance).

### 1.4 Standalone query — `sqlite/query` [search-ctx] → `{:results :raw-count}`

1. Blank search string → `{:results [] :raw-count 0}`.
2. Embed via `embedding/get-embedding` + `embedding/prefix-search-query` (`{:type :query}`).
3. KNN: `search_vec(?, '{k: 500}') v join search_doc d on d.id = v.rowid`, `where distance <= 0.7`, plus
   a filter subset: `archived?`, `models`, `ids`, `created-by`, `verified`. Order by distance, limit
   `semantic-search-results-limit`.
4. Row → `(assoc legacy_input :score (- 1 (/ distance 2)) :all-scores [...semantic-distance entry...])`.
5. Reuse as-is: `filter-read-permitted`, `apply-collection-id-filter` (private in `index.clj` — call via
   `#'` or make public), `search/collapse-id`, `scoring/with-appdb-scores`.

### 1.5 Wiring — `semantic_search/core.clj`

Fork at the *call sites*, not around whole bodies, so the existing fallback/merge logic in `results` is
reused already in iteration 1:

| defenterprise | SQLite branch |
|---|---|
| `supported?` | `(and (has-feature? :semantic-search) (sqlite/enabled?) embedder-supported?)` — today it requires pgvector via `semantic-search-available?` |
| `results` | replace only `(semantic.pgvector-api/query …)` with `(sqlite/query search-ctx)`; threshold, appdb fallback, dedupe stay |
| `update-index!` | `sqlite/upsert!` directly, no gate |
| `delete-from-index!` | `sqlite/delete!` |
| `init!` | `sqlite/init!` |
| `repair-index!` | no-op returning `{:index-id 0 :orphans 0 :snapshot-at (now)}` (check what the caller needs) |
| `diagnose` | return `{:type :missing-from-index :details {:reason :not-supported-on-sqlite}}` |

Also check `semantic-search-available?` callers (tasks: `task/indexer.clj`, `index_repair.clj`,
`index_cleanup.clj`, `metric_collector.clj`) — they must no-op or stay off the pgvector datasource in
SQLite mode. Easiest: `semantic-search-available?` returns false for the task side while `supported?`
returns true for the engine, or guard each task with `(not (sqlite/enabled?))`.

### 1.6 Demo + checks

- [ ] Start the dev app with the env var and an embedder configured, let `init!` finish, search from the UI.
- [ ] Create/rename/archive a card → shows up / renames / disappears (proves update/delete wiring).
- [ ] Smoke test: one deftest that inits a temp-file store, upserts 3 docs, gets the right top hit.

---

## Iteration 2 — reuse the pgvector query, rank as today (≈ 1.5–2 days)

### Principle

`index.clj` `query-index` builds one HoneySQL query (vector CTE + keyword CTE → FULL JOIN → RRF +
scorers) and then does embedding, permission filtering, collection filter and appdb scores in Clojure.
SQLite supports CTEs, window functions, `FULL JOIN` (3.39+; bundled is 3.50.3), `MATERIALIZED`, and
`ON CONFLICT … excluded.*`. The Postgres-specific SQL sits in a handful of leaf functions.

Mechanism: add `:store :sqlite` to the `index` map (with `:table-name "search_doc"`), pass the SQLite
connection as `db`, and branch on `(:store index)` in the leaves. Then `sqlite/query` becomes
`(semantic.index/query-index conn sqlite-index search-ctx)` and the iteration-1 standalone query is deleted.

### 2.1 Leaves to branch

| Spot | Where | Postgres | SQLite |
|---|---|---|---|
| Vector subquery | `index.clj` `semantic-search-query` / `brute-force-search-query` | `embedding <=> '[..]'` over the table | vec1 KNN CTE: select `common-search-columns` + `v.distance` from `search_vec(?, '{k: N}') v join search_doc`, filters in its WHERE; reuse the same outer `row_number() over (order by distance)` / `<= max-cosine-distance` wrapper. Ignore strategy — always this shape |
| HNSW state check | `index.clj` `query-index` → `semantic.util/index-state` | pg catalog query | skip when `:store :sqlite` (default strategy is `:brute-force`, so it's usually skipped anyway) |
| Keyword subquery | `index.clj` `keyword-search-query` | `to_tsquery`, `ts_rank_cd`, `@@` on tsvector | FTS5 — see 2.2 |
| `:view-count` | `scoring.clj` `view-count-percentile-query` | `percentile_cont … within group` | compute per-model percentile in Clojure from `select model, view_count from search_doc` (memoized like today) |
| `size` (dashboard, view-count) | OSS `metabase.search.scoring/size` | `least`/`greatest` | SQLite multi-arg `min`/`max` — add a `db-type` arity (or alias in the SQLite branch) |
| `:recency` | `scoring.clj` → `search.scoring/inverse-duration` | `extract(epoch …)`, `now()` | `(julianday(current_timestamp) - julianday(col)) * 86400`; add `:sqlite` to `inverse-duration` |
| `:exact` | `search.scoring/normalize-text-expr` | `regexp_replace` | no regex in SQLite: `trim(replace(lower(x), ',', ' '))` (whitespace-collapse approximation is fine) |
| `legacy_input` decode | `index.clj` `decode-legacy-input` | `PGobject` | plain string → `json/decode+kw` |
| `created-at` / `last-edited-at` filters | `index.clj` `filter-conditions` | `LocalDate` params | bind as ISO strings (timestamps are stored as text) |

Already fine, no change: `run-in-vector-session!` (no-op path for brute-force without explain),
`warm-connection-pool-async!` (no-op for non-c3p0), `flatten-ctes`, `hybrid-search-query`,
`scored-search-query`, `truthy`/`equal`/`prefix`/model-rank/library/data-layer/official/verified scorers,
`legacy-input-with-score`, all post-processing.

### 2.2 Keyword search on FTS5 (needed for RRF parity)

RRF in `scoring.clj` `rrf-rank-exp` weighs keyword rank at 0.51 — without keyword hits ranking is *not*
"as today". So:

- DDL: `create virtual table search_fts using fts5(name, searchable_text, native_query, content='', tokenize='porter unicode61')`,
  rowid = `search_doc.id`. Contentless is enough; we only need rowids + rank. Maintain it in `upsert!`/`delete!`.
  Bump `schema_version` → the file is rebuilt on next open.
- Weighting A/B (name vs text): `bm25(search_fts, 10.0, 1.0, 0.0)`; with `:search-native-query` use
  `bm25(search_fts, 10.0, 1.0, 1.0)` — mirrors the two tsvector columns.
- Query translation: FTS5 counterpart of `metabase.search.util/to-tsquery-expr` — same tokenizing
  (`split-preserving-quotes`, `or`, `-negation`, quoted phrases), emitting FTS5 syntax: terms `"foo"`,
  AND implicit, `OR`, `NOT`, phrase `"a b"`, last term prefix `"foo"*`.
- Keyword CTE: `select common-search-columns, row_number() over (order by bm25(...)) as keyword_rank
  from search_fts f join search_doc d on d.id = f.rowid where search_fts match ? and <filters>`,
  limit `semantic-search-results-limit`.

### 2.3 Parity check (the actual deliverable of iteration 2)

On one instance with both backends populated from the same documents:

- [ ] REPL helper in `dev/vec1.clj`: run the same `search-ctx` through `semantic.pgvector-api/query` and
      `sqlite/query`; print both top-10 side by side with `:all-scores`.
- [ ] Per-scorer diff on shared hits: every scorer except `:rrf`/`:semantic-distance`/`:view-count`
      should match exactly; those three should be close.
- [ ] ~20 real queries (exact names, typos, paraphrases, filters) — top-10 overlap and rank correlation.
- [ ] Latency per stage (embedding / db-query / perm-filter / appdb-scores are already logged by
      `query-index` at debug level) and file size at the instance's document count.

---

## Out of scope (production follow-up, if this is judged worth it)

Store protocol extracted from the leaves above; async write path through the gate/indexer; repair/DLQ;
multi-node story (SQLite is single-writer, per-node file); CI build matrix + runtime extension extraction
from the uberjar; ANN/training beyond flat mode; kill-switch setting instead of env var.

## Risks

- vec1 update/delete semantics (iteration 0) — may force rebuild-per-batch.
- Synchronous full `init!` embedding: slow / provider rate limits — run in a future for the demo.
- vec1 is pre-1.0 native code in the JVM; a crash kills the process. OK for a demo.
- Hidden Postgres-isms in the reused HoneySQL. Cheap to find: render
  `(sql-format-quoted (scored-search-query index embedding ctx scorers))` and run it against SQLite,
  fix error by error.
- FTS5 porter vs Postgres language-aware tsvector ranking — the keyword leg will differ somewhat; judge on
  overall top-10 parity, not identical ranks.

## Effort

| | |
|---|---|
| Iteration 0 | 1–2 h |
| Iteration 1 | ~1.5–2 days (demo-able in the UI) |
| Iteration 2 | ~1.5–2 days (ranking parity + comparison) |
