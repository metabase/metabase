# PLAN 001 — SQLite store: initialize, index, query

Part of [PLAN.md](PLAN.md) (covers its iteration 0 and the store half of iteration 1).

**Goal:** a standalone SQLite + vec1 store that can be opened/initialized, filled with Metabase's searchable
documents, kept up to date per document, and queried by vector — all driven from the REPL.

**Done when:** from a fresh REPL, with one env var set, you can index every searchable document of the dev
instance into the file, find a card by a paraphrase of its name, see renames/deletes reflected, restart and
reopen the same file without re-indexing, and switching the embedding model rebuilds the file.

**Not in this plan (→ PLAN_002):** wiring into `semantic_search/core.clj`. Reason: the write hooks
(`update-index!`, `delete-from-index!`) only fire when the semantic engine is active, which requires
`supported?` to be true, which would also route `results` through the engine. Writes and reads have to be
switched together, so wiring belongs with the search work. Also out: search results/scoring, FTS5, the
gate/indexer, uberjar extension extraction, linux builds.

---

## Phase A — vec1 spike ✅ done 2026-09-23

Runner: `native/vec1/spike/` (`clojure -M -m spike <check>…`, one fresh temp db per check). **Run crashing
checks in their own JVM** — the first run was in the dev nREPL and a segfault killed it
(`hs_err_pid3068.log` in the repo root).

vec1 0.7 (NEON, multi-threaded), sqlite-jdbc 3.50.3.0, macOS aarch64, JDK 25.

- [x] Create `vec1(vector, model, archived)` + `rebuild '{index:"flat", distance:"cos"}'` on an **empty**
      table works. Shadow tables: `_config _base _idx _model _meta`.
- [x] Insert with explicit rowid → rowid kept, found by KNN **without** another rebuild.
- [x] `DELETE … WHERE rowid = ?` → gone from KNN; re-insert same rowid → back. Inserting an existing
      rowid → `SQLITE_CONSTRAINT_PRIMARYKEY` (so delete first).
- [x] ❌ **`UPDATE` crashes the JVM (SIGSEGV in `vec1ColumnMethod`)** — any form: vector only, meta only,
      all columns. Root cause confirmed: **reading the hidden `distance` column without a query vector
      segfaults** (`select rowid, distance from search_vec where rowid = ?` crashes too); UPDATE reads all
      columns to build the new row. `select rowid, vector, model …` without a query is fine.
      → **Never UPDATE; always delete + insert. Never select `distance` outside a KNN call.** Report upstream.
- [x] Meta filters are **pre-filters** (pushed into the scan): with 50 cards near the query and 50
      dashboards far away, `k=5 where model = 'dashboard'` returns 5 dashboards. Pushed and verified:
      `=`, `a = ? and b = ?`, `>`, `IN (…)` (single and multi value, incl. non-existent values).
- [x] ❌ `!=` is **not** pushed: `model != 'card'` → 0 rows (post-filter over the top 5). Only use `= < > <= >= IN IS [NOT] NULL`.
- [x] Filters on a **joined** table are post-filters: `k=5 … where v.model = 'dashboard' and d.archived = 0`
      → 3 rows. Anything that must not shrink results belongs in a vec1 meta column.
- [x] `k`: `search_vec(?) limit 3` works standalone, but **LIMIT is not visible through a join**
      (`vec1: no K value or visible LIMIT clause`), and no k + no LIMIT errors. → **Always pass `{k: N}`.**
      `k` larger than row count just returns all rows.
- [x] `distance` for `cos` = `1 − cos`: identical 0.0, cos 0.6 → 0.4, orthogonal 1.0, opposite 2.0.
      Same as pgvector `<=>`; the 0.7 cutoff and `cosine-distance-ceiling` 2.0 carry over unchanged.
- [x] 100 inserts in one transaction, commit, close, reopen → all searchable. Insert + rollback → not visible.
- [x] Timing, 5 000 random 384-dim vectors: insert (batches of 100 per tx) **112 ms total**; KNN k=50
      **2.0 ms** avg, with `model = ?` filter **1.5 ms**; file **7.9 MB** (~1.6 KB/vector).

### Consequences for the phases below

- Phase C: `search_vec` meta columns should cover the **filters that must not shrink results**, not just
  `model`/`archived`. Candidates: `model`, `archived`, `verified`, `database_id`, `creator_id`,
  `collection_id`. Scalars only; `IN` works, `!=` does not.
- Phase D: write = `delete from search_vec where rowid = ?` + `insert` — never `UPDATE`.
- Phase E: always `'{k: N}'`; never project `distance` without the query arg; only pushed operators on `v.*`.
- Guardrail: all vec1 SQL lives in the store ns behind functions — no ad-hoc SQL against `search_vec`
  elsewhere, since a wrong query kills the process.
- [ ] Report upstream — details and repro in [LIMITATION_001_update_crash.md](LIMITATION_001_update_crash.md).
      Repro: `clojure -M -m spike select-distance-no-query`.

## Phase B — namespace, config, connection ✅ done 2026-09-23

`enterprise/backend/src/metabase_enterprise/semantic_search/sqlite.clj`, tests in
`enterprise/backend/test/metabase_enterprise/semantic_search/sqlite_test.clj` (8 tests, 14 assertions, green:
`./bin/test-agent :only '[metabase-enterprise.semantic-search.sqlite-test]'`). Kondo clean;
`fix-modules-config` → `:unchanged`.

- [x] `db-path` — `MB_SEMANTIC_SEARCH_SQLITE_PATH` (trimmed, nil when blank); `enabled?`.
- [x] `platform` → `darwin-aarch64` / `linux-x86_64` / …; `extension-path` — `MB_VEC1_EXTENSION_PATH`
      override, else **classpath resource** `vec1/<platform>/vec1.<dylib|so|dll>` (`resources` is on the dev
      classpath, so no cwd dependence). A resource inside a jar is rejected (extraction = production work).
      Throws `No vec1 extension for this platform…` when missing.
- [x] State: private `lock` + `state` atom `{:conn :path}`.
- [x] `open!` / `(open! path)` — WAL, busy timeout 5 s, `SELECT load_extension(?)`; no-op for the same path,
      closes the previous store for another path. (Schema check is Phase C.)
- [x] `close!`; **`delete-store!`** instead of `reset!` (avoids shadowing `clojure.core/reset!`) — closes if
      open and deletes the db, `-wal`, `-shm`, `-journal`.
- [x] `with-conn [conn] …` — opens from `db-path` on demand, holds the lock for the whole body. Linted as
      `clojure.core/fn` (`.clj-kondo/config.edn`, next to `with-dbs`).
- [x] `->blob` / `<-blob`; `vec1-info`.
- [x] `./bin/mage fix-modules-config` → `:unchanged`.

Tests: platform format, blob round trip, missing extension throws, open/close/idempotent reopen,
switching paths, delete removes files, 200 concurrent `with-conn` writers all land, vec1 KNN smoke test.

## Phase C — schema = the "migration" ✅ done 2026-09-23

Not Liquibase — the file is not the app DB. Checked on every `open!`; the index is a cache, so a mismatch
deletes and recreates the file and re-indexing refills it. 13 tests / 37 assertions green.

- [x] `schema-version` = 1. Bump it whenever DDL changes (PLAN_002 will, for FTS5).
- [x] `meta(k, v)` holds `schema_version`, `provider`, `model_name`, `vector_dimensions`,
      **`embedding_space_id`** — the same identity pgvector's `index-metadata/find-compatible-index!` matches on.
      The model is resolved with `semantic.embedding/resolve-model` only when it lacks `:embedding-space-id`
      (lets tests pass a fake model without a provider).
- [x] Check lives in `open!` (private `open-store`), not a separate `ensure-schema!`, because recreating needs
      to close/delete/reopen the connection:
  - new empty file → create → `:created`;
  - `meta` equal → `:existing` (data kept);
  - `meta` differs, or the file has tables but no `meta` → warn, delete files, reopen, create → `:recreated`.
- [x] `open!` takes `{:embedding-model m}` (default: configured model); reopening the same path for a different
      model switches the store. State keeps the resolved model: `(sqlite/embedding-model)` for Phases D/E.
- [x] `store-info` → `{:path :schema :embedding-model :meta}`.
- [x] `search_doc` — pgvector column names minus embedding/tsvectors, `id INTEGER PRIMARY KEY` = vec1 rowid,
      `UNIQUE (model, model_id)`, timestamps as TEXT.
- [x] `search_vec` — `vec1(vector, model, archived, verified, database_id, creator_id, collection_id)`
      (`sqlite/vec-meta-columns`) + `rebuild` to flat/cos. Filtered KNN on meta columns verified in a test.
- [x] Whole create in one transaction (virtual table DDL inside a transaction works).
- [x] Verified in the dev REPL with the configured ai-service model
      (`Snowflake/snowflake-arctic-embed-l-v2.0`, 1024 dims).

Tests added: created → existing with data kept; recreated on each of dims / space id / model name / provider;
recreated on `schema-version` bump; recreated for a foreign file; meta-column pre-filter with k = 1.

## Phase D — write path ✅ done 2026-09-23

In `sqlite.clj`; 18 tests / 70 assertions green (stubbed embeddings). Walkthrough steps 10–15 in
`dev/src/dev/vec1_store.clj`, verified in the dev REPL with the ai-service model.

- [x] `doc->row` — port of `index.clj` `doc->db-record` minus pg bits: `model_id` as string, booleans 0/1,
      timestamps ISO strings, `legacy_input` kept if already a string else JSON, `metadata` = JSON of the doc.
      `to-instant`, `to-boolean`, `batch-resolve-personal-owner-ids` in `index.clj` made public.
- [x] `upsert-documents!` [docs] — batches of `*batch-size*` 100:
  1. rows deduped by `(model, model_id)`, last wins (one multi-row `ON CONFLICT` can't touch a row twice);
  2. **content cache**: a row whose stored `content` equals the new one reuses its stored vector
     (`SELECT vector FROM search_vec WHERE rowid = ?` — never `distance`);
  3. the remaining distinct texts are embedded via `semantic.embedding/process-embeddings-streaming`
     (same provider batching as pgvector), **outside** the lock;
  4. rows without a vector (provider skipped the text) or with the wrong size → logged, `:skipped`;
  5. one transaction: multi-row upsert into `search_doc`, look up ids, then per row
     `DELETE FROM search_vec WHERE rowid = ?` + `INSERT` with the meta columns (never `UPDATE`).
  - Returns counts `{:upserted :embedded :reused :skipped :failed}` — not `{model n}` as in the plan;
    counts are what the REPL/log needs.
- [x] Embedding call throws → whole batch `:failed`, nothing written, next batch continues.
- [x] `delete-documents!` [model ids] — ids as numbers or strings; unknown ids ignored; returns count removed.
- [x] `index-all!` — logs cumulative counts per batch, returns counts + `:elapsed-ms`. Does **not** prune docs
      that disappeared from the instance (that's `repair`'s job; out of scope).
- [x] `index-all-async!` — future, one run at a time (returns nil while running).

Measured on the dev instance (64 docs, ai-service `snowflake-arctic-embed-l-v2.0`, 1024 dims):
full index **1.2–1.5 s** (embedding dominated), re-run with nothing changed **~45 ms** (all reused).

## Phase E — query path: "the index is queryable" ✅ done 2026-09-23

Raw store queries, not the search engine (that's PLAN_002). 22 tests / 97 assertions green. Walkthrough
steps 15–17; the walkthrough's `knn`/`search-text`/`doc-row` helpers now call these functions.

- [x] `knn` [query-vector & {:keys [k max-distance] …}] — `k` default 50, interpolated into
      `search_vec(?, '{k: N}')` (LIMIT isn't visible to vec1 through the join). Returns
      `:id :model :model_id :name :collection_id :legacy_input :distance`, nearest first, `legacy_input` decoded.
      Filters, all on vec1 meta columns with `IN` / `=` (pre-filter): `:models`, `:database-ids`, `:creator-ids`,
      `:collection-ids` (collections; **empty = match nothing**, no query run), `:archived?`, `:verified?`.
      `:max-distance` is applied in Clojure — SQL never filters on `distance`.
- [x] `search-text` [text & opts] — embed with `prefix-search-query` + `{:type :query}` (`:record-tokens?`
      default true), then `knn`. Returns `{:rows :embedding-ms :knn-ms}`. An empty-collection filter returns
      at once without embedding.
- [x] `stats` — `:docs` / `:vectors` (equal when consistent), `:by-model`, `:file-bytes` (db + WAL), `:meta`,
      `:vec1`, plus `store-info` keys.
- [x] `get-doc` [model id] — full `search_doc` row, `legacy_input`/`metadata` decoded, `:has-vector?`
      (checked with `SELECT rowid`, never `distance`).

Measured on the dev instance (63–64 docs, 1024 dims): KNN **0.3–7 ms**, query embedding **~200–290 ms**
(ai-service round trip) — the embedding is >95% of a search.

Test note: the write path resolves personal-collection owners from the app DB; the unit tests stub
`semantic.index/batch-resolve-personal-owner-ids` so the store tests don't need one.

## Phase F — REPL workflow + tests (2–3 h)

- [ ] Rewrite the `(comment …)` block in `dev/src/dev/vec1.clj` to drive the store:
      `open!` → `stats` → `index-all!` from `searchable-documents` → `search-text` paraphrases → rename a card
      and `upsert-documents!` it → `delete-documents!` → `close!`/`open!` (expect `:existing`) → `delete-store!`.
- [ ] Test ns `enterprise/backend/test/metabase_enterprise/semantic_search/sqlite_test.clj`, temp file per test,
      skipped when the extension for this platform is missing. Stub embeddings with `with-redefs` on
      `semantic.embedding/get-embeddings-batch` / `get-embedding` returning deterministic small vectors (e.g. 8 dims):
  - [ ] `ensure-schema!` is idempotent (`:created` then `:existing`).
  - [ ] Changed model dims → `:recreated`, file empty.
  - [ ] Upsert 3 docs → `stats` doc count = vec count = 3; nearest to doc 2's vector is doc 2.
  - [ ] Re-upsert doc with new name → still 3 rows, `get-doc` shows new name, KNN still finds it.
  - [ ] Delete → gone from both tables and from KNN.
  - [ ] Meta filter: `:models ["dashboard"]` returns only dashboards.
- [ ] Run with `./bin/test-agent :only '[metabase-enterprise.semantic-search.sqlite-test]'`.

## Acceptance (record numbers here)

- [ ] Full index of the dev instance: doc count ____, time ____, embedding provider ____, file size ____.
- [ ] `stats`: `search_doc` count = `search_vec` count.
- [ ] 5 paraphrase queries → expected entity in top 3: __/5.
- [ ] Query latency: embedding ____ ms, knn ____ ms.
- [ ] Reopen after REPL restart → `:existing`, no re-index.
- [ ] Switch embedding model → `:recreated`.

## Effort

| Phase | |
|---|---|
| A spike | ✅ done |
| B connection | ✅ done |
| C schema | ✅ done |
| D writes | ✅ done |
| E queries | ✅ done |
| F REPL + tests | 2–3 h |
| **Remaining** | **~2–3 h** (F) |

## Decisions taken (change here if needed)

- Env var required; no default file location.
- Single connection, all access serialized. Revisit only if query latency under concurrent writes hurts.
- Batch size 100, default k 50.
- `search_vec` carries meta columns for every filter that must not shrink results (Phase A); anything else
  filters on `search_doc` after the KNN and may return fewer than k.
- Synchronous writes, no gate/DLQ/repair.
