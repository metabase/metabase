# Agent E: embedding text variants

Read `_shared-context.md` first. Session: `metabase-sqlite-semantic-search-8a [36af46]`.

## Mission

Semantic search embeds almost nothing. `embeddable-text` (`src/metabase/search/ingestion.clj`) takes
each model's `:search-terms`, which are **name + description** for most models (collections and
documents: name only). The vector arm never sees the collection path, parent table, chart type, or SQL.
The keyword arm does see SQL (through `text_search_with_native_query_vector`), which hides the gap.

Agent E adds an **opt-in** switch for richer embedding text. It becomes axis 4 of the matrix:
**embedding text variant**.

This is the one deliberate exception to "don't touch Metabase". The text is built inside ingestion,
so it can't be changed from outside. The change is kept small, is off by default, and is switched
entirely over the API.

You own: the `search-embedding-text-variant` setting in `src/metabase/search/settings.clj`,
`embeddable-text` in `src/metabase/search/ingestion.clj` and its tests.

## The switch

Admin setting `search-embedding-text-variant` (env `MB_SEARCH_EMBEDDING_TEXT_VARIANT`):

| Value | Embedded text |
|---|---|
| `baseline` (default) | Today's behaviour, byte-for-byte: `[model]` + `:search-terms` |
| `context` | baseline + context the ingestion row already carries: collection name, database, schema, parent table (segments, measures), collection description, chart type |
| `context-sql` | context + the card's native SQL, cut to 1000 characters |

Column names from `result_metadata` are left out: ingestion doesn't select them, and adding them would
change the ingestion query.

## How the runner switches variants (all outside-in)

```
PUT  /api/setting/search-embedding-text-variant   {"value": "context"}     # admin
POST /api/search/re-init                                                     # admin; drops + rebuilds indexes
GET  /api/ee/semantic-search/status   until indexed_count ≈ total_est        # wait for re-embedding
GET  /api/setting/search-embedding-text-variant                              # record on the run
```

While the setting is on its default, `GET /api/setting/search-embedding-text-variant` returns **204 with an
empty body** (standard Metabase behaviour). Record an empty value as `baseline`. `GET /api/setting` lists
it with `value: null, default: "baseline"`.

- **A variant change means a new run**, like an embedder change. Record the value on `harness_run`.
- **Re-embedding costs a full pass.** The gate hashes the whole document and the embedding cache is
  keyed by exact text, so every document with changed text is embedded again. Switching back to a
  variant used earlier is cheap: those texts are still cached.
- **It only moves the vector arm.** `searchable_text` and the keyword index are unchanged, so `appdb`
  and `in-place` must produce identical results across variants. That doubles as a sanity check.
- Engines by Libor and Paolo pick this up only if they embed the document's `:embeddable_text`. If they
  build their own text, they are outside this axis. Record that, don't fake it.

## Risks

- Longer text can push a document past the per-batch token budget, where it is **silently dropped**
  (`embedding.clj`, BOT-1742). The SQL cut keeps this unlikely. Compare `status.indexed_count` across
  variants anyway.
- `all-minilm` only reads about 256 tokens. Anything longer is cut off by the model, so `context-sql`
  may help less with it than with `snowflake-arctic-embed2`. That interaction is itself a finding.
