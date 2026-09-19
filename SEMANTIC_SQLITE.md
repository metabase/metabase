# Semantic search on SQLite

Semantic search normally needs a Postgres database with the [pgvector](https://github.com/pgvector/pgvector)
extension — either a dedicated one (`MB_PGVECTOR_DB_URL`) or a Postgres application database that can host the
extension. This branch adds a third option: keep the whole index in a **local SQLite file**, with no Postgres
anywhere.

That makes semantic search available to instances whose application database is H2 or MySQL/MariaDB, to
single-container deployments, and to local development, where standing up pgvector is the main obstacle.

Nothing has to be compiled or installed. Metabase already ships the [xerial SQLite
driver](https://github.com/xerial/sqlite-jdbc) for the Sample Database, and its bundled SQLite (3.50) has FTS5
and extension loading compiled in.

---

## Quick start

Semantic search needs two things: somewhere to keep the index, and something to turn text into vectors. This
example uses the local option for both — the SQLite store and the in-process embedder plugin — so the whole
feature runs with no database and no service beyond Metabase itself.

The embedder ships separately from the uberjar, so build it and drop it in the plugin directory:

```bash
./bin/build-embedder-plugin.sh                                  # downloads the pinned models
cp modules/embedder/target/metabase-embedder-plugin.jar plugins/
```

Then:

```bash
# where the index lives; parent directories are created on demand
export MB_SEMANTIC_SEARCH_SQLITE_PATH=/data/metabase/semantic-search.db

# embed in this JVM, from the model the plugin bundles
export MB_EE_EMBEDDING_PROVIDER=in-process
export MB_EE_EMBEDDING_MODEL=Snowflake/snowflake-arctic-embed-xs
export MB_EE_EMBEDDING_MODEL_DIMENSIONS=384

# serve search with the semantic engine
export MB_SEARCH_ENGINE=semantic
```

All three embedding settings are required: the defaults describe the larger model the AI service serves, and
a model name or dimension the plugin doesn't bundle fails readiness rather than falling back to another
model. The plugin also runs on fewer platforms than the store — glibc 2.34 or newer on Linux, or Apple
Silicon macOS, and **not** Alpine. [Embedding providers](#embedding-providers) covers that, and the remote
providers to use instead.

Start Metabase. On first run it creates the store, indexes your content in the background, and search begins
answering from it. You still need the `semantic-search` premium feature — the SQLite store changes where the
index lives, not who is entitled to it.

To check what the instance picked, look for this line in the log:

```
Opening semantic search SQLite store at /data/metabase/semantic-search.db
```

and confirm the engine with `Search will be served by the :search.engine/semantic engine`. The admin health
inspector reports the store under `pgvector-store` with the storage label `sqlite`.

---

## Configuration

### Choosing the store

The store is chosen once, from the environment, in this order:

| Order | Setting | Store |
|---|---|---|
| 1 | `MB_PGVECTOR_DB_URL` is set | dedicated pgvector database |
| 2 | `MB_SEMANTIC_SEARCH_SQLITE_PATH` is set | **SQLite file** |
| 3 | app DB is Postgres and can host `vector` | the application database, in a `semantic_search` schema |
| 4 | none of the above | semantic search is unavailable |

A dedicated pgvector URL always wins, so setting both leaves existing deployments untouched. A blank or
whitespace-only value counts as unset. Unlike the app-db option, the SQLite path is never probed or guessed:
if you set it, it is used, whatever the application database is.

### Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `MB_SEMANTIC_SEARCH_SQLITE_PATH` | yes | Path to the SQLite file holding the index. Parent directories are created if missing. |
| `MB_SEMANTIC_SEARCH_SQLITE_VEC_PATH` | no | Path to the [sqlite-vec](https://github.com/asg017/sqlite-vec) loadable extension, for a faster native distance function. See [Optional: sqlite-vec](#optional-sqlite-vec-acceleration). |

Everything else is the existing semantic search configuration and behaves identically:
`MB_EE_EMBEDDING_PROVIDER`, `MB_EE_EMBEDDING_MODEL`, `MB_EE_EMBEDDING_MODEL_DIMENSIONS`,
`MB_SEARCH_ENGINE`, `MB_ADDITIONAL_SEARCH_ENGINES`, and the `semantic-search-*` settings.

### Embedding providers

The store and the embedder are independent choices — the SQLite store works with whichever
`MB_EE_EMBEDDING_PROVIDER` you already run. But the store only removes *one* of the two reasons semantic
search needs infrastructure; pairing it with a local embedder removes the other:

| Provider | Runs where | Notes |
|---|---|---|
| `in-process` | inside the Metabase JVM | The [embedder plugin](modules/embedder/README.md): a bundled ONNX model on DJL. **No network and no service at all** — see below. |
| `ollama` | `http://localhost:11434` | Host is hardcoded, so Ollama must run on the Metabase host. |
| `openai` | wherever `MB_LLM_OPENAI_API_BASE_URL` points | OpenAI-compatible `/v1/embeddings`, so it also reaches a local vLLM, llama.cpp, LM Studio or TEI server. |
| `ai-service` (default) | `MB_EE_EMBEDDING_SERVICE_BASE_URL` | Metabase's embedding service; local if you host it. |

#### `in-process`

The [quick start](#quick-start) above has the full recipe. The plugin bundles
`Snowflake/snowflake-arctic-embed-xs` (384 dimensions) for semantic search, and
`sentence-transformers/all-MiniLM-L6-v2` for the data complexity score. A model it doesn't bundle is not an
option: custom model sources are deliberately unsupported.

Its platform support is narrower than the store's: glibc 2.34 or newer on Linux (x86-64 or ARM64), or Apple
Silicon macOS. It is **not** musl-compatible, so it cannot run in Metabase's default Alpine image — which the
pure-JVM SQLite store can — and Intel macOS is unsupported because the tokenizer dependency ships no
x86-64 macOS native library. On an unsupported platform, use one of the providers below.

Because the embedding space is identified partly by the architecture-specific export, every node sharing an
index must run the same architecture; a mixed ARM64/x86-64 cluster fails closed rather than querying vectors
produced by a different export. That is not a constraint for a SQLite store, which is single-instance anyway.

#### `ollama`

```bash
export MB_EE_EMBEDDING_PROVIDER=ollama
export MB_EE_EMBEDDING_MODEL=all-minilm
export MB_EE_EMBEDDING_MODEL_DIMENSIONS=384
```

Pull the model yourself first (`ollama pull all-minilm`) — the provider has a `prepare!` that would pull it,
but nothing on the startup path calls it. The endpoint is hardcoded to `http://localhost:11434` and is not
configurable, so Ollama has to run on the Metabase host.

#### `openai`

Set `MB_LLM_OPENAI_API_BASE_URL` and the provider posts to `<base-url>/v1/embeddings`, so this reaches any
OpenAI-compatible server — a local vLLM, llama.cpp, LM Studio or Text Embeddings Inference — as well as
OpenAI itself. Set the model and dimensions to whatever that server serves.

### Settings that behave differently

- **`semantic-search-vector-strategy`** is ignored: SQLite has no HNSW index, so every vector search is an
  exact scan (the equivalent of `:brute-force`). Requesting `:hnsw` transparently gets the exact scan, which
  returns *better* results (exact rather than approximate) at a higher cost per query.
- **`semantic-search-explain`** is off: it reads Postgres `EXPLAIN (ANALYZE, FORMAT JSON)` plans.
- Library **entity retrieval** (`:library-retrieval`) is Postgres-only and stays disabled on a SQLite store.

---

## How it works

### Storage layout

One file, plus SQLite's usual `-wal` and `-shm` companions while the database is open. Inside it:

```
index_metadata, index_control, index_gate   control plane (which index is active, pending changes)
migration                                   schema version bookkeeping
dlq_<index-id>                              dead letter queue for failed documents
index_<provider>_<model>_<dims>_e<hash>     the index itself (hash = embedding space)
  …_fts (+ _fts_data, _fts_idx, …)          FTS5 keyword index over the same rows
```

The index table mirrors the Postgres one, with the types SQLite offers: booleans as 0/1, JSON as text,
timestamps as text, and embeddings as float32 BLOBs. Where Postgres keeps two `tsvector` columns, SQLite keeps
the raw `searchable_text` and `native_query` the tsvectors were built from, and indexes them in FTS5.

### Vector search

Embeddings are stored as **float32 little-endian BLOBs**, and compared by `vec_distance_cosine(a, b)`, which
stands in for pgvector's `<=>` operator. The default implementation is a JVM function registered on each
connection; it walks the two vectors and returns `1 - cos(a, b)`, matching pgvector's semantics (`NULL` for a
zero-norm vector, an error on a dimension mismatch).

The name, signature and BLOB layout are deliberately **sqlite-vec's**, so the native extension is a drop-in
replacement for the JVM function with no change to any query.

The query shape is the same as the Postgres `:brute-force` strategy: filter first inside a `MATERIALIZED` CTE,
compute distances there, then rank and apply the `0.7` cosine cutoff outside it.

### Keyword search

The hybrid ranking keeps both arms. The keyword arm is an **FTS5 external-content table** whose rows are kept
in step with the index table by `AFTER INSERT/UPDATE/DELETE` triggers, so it needs no separate maintenance and
cannot drift. It is tokenized with `porter unicode61 remove_diacritics 2` and ranked with
`bm25(fts, 1.0, 0.4, 0.4)`, chosen to mirror Postgres's `ts_rank_cd` weighting of the name (A = 1.0) against
the body (B = 0.4).

Search strings are translated from Metabase's search syntax into FTS5 syntax (`search-string->fts5-query`),
preserving the semantics of the Postgres `tsquery` translation: terms are ANDed, `or` separates alternatives,
`"quoted phrases"` match in sequence, `-term` excludes, and the last term matches as a prefix. Every term is
quoted as an FTS5 string, so user input can never be read as query syntax.

The two arms are then merged by the same Reciprocal Rank Fusion scoring used on Postgres.

### The JDBC adapter (the load-bearing piece)

The rest of the module is written against pgjdbc: it binds `java.sql.Timestamp`/`Instant` values and reads
back `Timestamp`, `Boolean` and `Long`. Left alone, xerial binds a `Timestamp` as epoch-milliseconds and an
`Instant` through its variable-precision `toString`, neither of which compares correctly against stored
values — which would silently corrupt the gate's ordering and the indexer's watermark.

Rather than convert at each of the dozens of call sites (where one miss is a silent bug), every SQLite
connection is wrapped in a small JDBC proxy that makes the driver behave like pgjdbc:

- **Binding**: `Timestamp`, `Date`, `Instant`, `OffsetDateTime` and `ZonedDateTime` bind as fixed-width UTC
  text with microsecond precision (`2026-01-02T03:04:05.123456Z`); `LocalDate` binds as `yyyy-MM-dd`.
- **Reading**: columns declared `TIMESTAMP` come back as `Timestamp` and `BOOLEAN` as booleans; expression
  columns, which have no declared type (`clock_timestamp()`, `count(*)`), come back as `Timestamp` when they
  hold timestamp text and as `Long` when they hold an integer.

The fixed-width text format is what makes this work: it sorts chronologically as plain text, so `ORDER BY`,
`BETWEEN` and the gate's `(gated_at, id)` keyset pagination behave exactly as they do on Postgres, and
SQLite's own date functions (`julianday`) still parse it.

### Postgres compatibility functions

Registered on each connection, so shared SQL needs no dialect branch:

| Function | Notes |
|---|---|
| `vec_distance_cosine(a, b)` | pgvector's `<=>`; skipped when sqlite-vec provides it |
| `clock_timestamp()`, `now()` | current time in the stored text format |
| `greatest(…)`, `least(…)` | Postgres semantics: NULL arguments are ignored |
| `regexp_replace(s, p, r[, flags])` | Java regex; replaces all with flag `g`, else the first |

Two things SQLite cannot express are computed elsewhere: `percentile_cont` (the view-count percentile is
computed in Clojure) and `EXTRACT(EPOCH FROM …)` (health metrics use `julianday` arithmetic).

### Concurrency and connection settings

The store runs in **WAL** mode with `synchronous=NORMAL`, so searches read while the indexer writes.
Transactions are **IMMEDIATE**: they take the write lock at `BEGIN`, so a transaction that reads before
writing waits on `busy_timeout` (30s) instead of failing on lock upgrade. Connections are pooled with c3p0
(1–8), `temp_store=MEMORY`, a 64 MiB page cache and a 256 MiB mmap window. These live in `sqlite-pragmas` in
`db/sqlite.clj`.

Because SQLite serializes writers by itself, the Postgres advisory lock around migrations is a no-op here.

---

## Optional: sqlite-vec acceleration

[sqlite-vec](https://github.com/asg017/sqlite-vec) is a loadable extension providing a SIMD implementation of
the same function over the same BLOB format. Point Metabase at the library and it is loaded on every
connection, replacing the JVM function:

```bash
export MB_SEMANTIC_SEARCH_SQLITE_VEC_PATH=/opt/sqlite-vec/vec0.dylib   # .so on Linux, .dll on Windows
```

Prebuilt binaries are published per OS/arch on the project's
[releases page](https://github.com/asg017/sqlite-vec/releases) (`…-loadable-<os>-<arch>.tar.gz`). There is no
Maven artifact, so the file has to be placed on the host yourself. Upstream publishes no musl builds, so
Alpine-based images need the JVM function. On macOS, a binary downloaded through a browser carries a quarantine flag that
must be cleared (`xattr -d com.apple.quarantine vec0.dylib`); fetched with `curl` it has none.

**Measured**, 20,000 vectors × 384 dimensions, top-10 query, macOS arm64 (M-series), best of 7 after warm-up:

| Implementation | Per query | Top-10 results |
|---|---|---|
| JVM function (default) | 24 ms | identical |
| sqlite-vec v0.1.9 | 10 ms | identical |

Both return exactly the same rows in the same order, which is the point of sharing the format: the extension
is a performance switch, not a behaviour change. At Metabase-typical index sizes (10³–10⁴ documents) the JVM
function is comfortably fast enough, and the embedding round-trip dominates the query anyway. sqlite-vec earns
its keep when the index grows large or the host lacks spare CPU.

sqlite-vec's own KNN (`vec0` virtual tables) is *not* used — only its scalar distance function. Both are
brute-force scans; the `vec0` table would add a second copy of every vector without changing the algorithm.

---

## Operational notes

- **Single node.** SQLite has one writer, and the store is a local file. This suits single-instance
  deployments. Do not point several Metabase instances at one file over a network filesystem — the file lock
  semantics that keep it consistent don't hold on NFS/SMB.
- **Backups.** Stop Metabase and copy the `.db` (plus `-wal`/`-shm`), or use `sqlite3 file.db ".backup out.db"`
  against a running instance. There is nothing precious in it: deleting the file makes the instance rebuild
  the index from scratch on the next start, at the cost of re-embedding.
- **Sizing.** The dominant term is the embeddings: 4 bytes × dimensions × documents (10,000 documents at 1024
  dimensions ≈ 40 MB), plus the indexed text and the FTS5 index.
- **Disk.** Put the file on real local disk, not a network mount, for both correctness and latency.
- **Switching stores.** Moving between SQLite and pgvector means re-indexing; the stores share no data. Set
  the new variable and restart — the instance will notice there is no compatible active index and build one.

---

## What's not supported

| Feature | Status on SQLite |
|---|---|
| HNSW / approximate search | Not available; searches are exact scans |
| `semantic-search-explain` instrumentation | Postgres `EXPLAIN` only |
| Library entity retrieval | Postgres-only |
| Multi-instance / clustered deployments | Not supported |

---

## Testing

The existing semantic search suite runs against SQLite; tests that can only be answered by Postgres (HNSW,
`pg_catalog` lookups, app-db schemas, the pre-SQLite migration history, `PGobject` shapes) are tagged
`^:mb/pgvector-only`.

```bash
# the whole module against a SQLite store
MB_SEMANTIC_SEARCH_SQLITE_PATH=/tmp/semantic-test.db \
  ./bin/test-agent :module enterprise/semantic-search :exclude-tags '[:mb/pgvector-only]'

# the SQLite store's own tests; these need no configuration (they use temp files)
./bin/test-agent :only '[metabase-enterprise.semantic-search.db.sqlite-test]'

# unchanged: the module against pgvector
MB_PGVECTOR_DB_URL='jdbc:postgresql://localhost:5432/mb_semantic_search?user=postgres&password=postgres' \
  ./bin/test-agent :module enterprise/semantic-search
```

CI gained a `semantic-search-tests-sqlite` leg that runs the module with that exclusion and **no pgvector
service at all**.

That suite runs on four-dimensional mock embeddings, so it never sees a real model's vector width.
`sqlite-in-process-embedder-test` closes that gap: one round trip on real 384-dimension vectors from the
in-process embedder plugin, asserting the stored BLOBs are 1536 bytes, that the vector arm answers a query
sharing no term with its document ("puppy" → *Dog Training Guide*), and that the fused and default-weight
paths run over the same rows. It needs the plugin jar, so it skips unless opted in, and runs in CI from the
`test-embedder-plugin` job — the one place the jar is built:

```bash
./bin/build-embedder-plugin.sh
MB_SEMANTIC_SEARCH_SQLITE_PATH=/tmp/semantic-test.db \
  MB_IN_PROCESS_EMBEDDER_SEMANTIC_SEARCH_TEST=true \
  MB_PLUGINS_DIR=modules/embedder/target \
  ./bin/test-agent :only '[metabase-enterprise.semantic-search.sqlite-in-process-embedder-test]'
```

Results at the time of writing:

| Run | Result |
|---|---|
| Module on SQLite (JVM function) | 260 tests, 1285 assertions, 0 failures |
| Module on SQLite (sqlite-vec v0.1.9) | 260 tests, 1285 assertions, 0 failures |
| Module on Postgres/pgvector (regression) | 289 tests, 1511 assertions, 0 failures |
| Default, no store configured | 31 tests, 164 assertions, 0 failures |

The store was also exercised end to end against a live instance on an H2 application database with real
Ollama (`all-minilm`) embeddings: content indexed through the real gate and indexer, then paraphrase queries
matched through the full search stack ("money earned per sales area" → *Quarterly Revenue by Region*), with
FTS5 answering keyword-only queries.

Only the macOS arm64 sqlite-vec binary has been exercised; the Linux and Windows builds use the same
interface, but have not been run here.

---

## Where the code lives

| Path | What |
|---|---|
| `enterprise/backend/src/metabase_enterprise/semantic_search/db/sqlite.clj` | The store: value encoding, FTS5 query translation, user functions, JDBC adapter, pooled data source |
| `…/semantic_search/db/datasource.clj` | Store selection (`pgvector-mode`, `sqlite?`, `postgres-store?`) |
| `…/semantic_search/index.clj` | Index DDL, FTS5 table and triggers, keyword/vector query builders |
| `enterprise/backend/test/metabase_enterprise/semantic_search/db/sqlite_test.clj` | Unit, adapter and end-to-end tests (no configuration needed) |
| `…/semantic_search/sqlite_in_process_embedder_test.clj` | Round trip on real vectors from the in-process embedder plugin |
| `.github/workflows/semantic-search.yml` | The `semantic-search-tests-sqlite` CI leg |
| `.github/workflows/build-scripts.yml` | The in-process embedder round trip, in the job that builds the plugin |

Everything else in the module — gate, indexer, dead letter queue, repair, health checks, metrics, cleanup
tasks — is shared with the Postgres store and branches only where the dialects genuinely differ.
