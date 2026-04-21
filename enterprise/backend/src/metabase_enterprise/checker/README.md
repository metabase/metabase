# Checker Module

Validates serdes YAML exports without a running Metabase instance or database connection.

Given two directories — database schemas and exported entities — the checker
resolves all references, runs query validation, and reports what's broken.

## Quick Start

```bash
# Dev mode
clj -M:dev:drivers:ee -m metabase.core.bootstrap \
  --mode checker \
  --export /path/to/export \
  --schema-dir /path/to/databases

# Built jar
java -jar metabase.jar --mode checker \
  --export /path/to/export --schema-dir /path/to/databases
```

Exit code 0 when all checks pass, 1 when any fail.

Example call against representations with edits intentionall introducing errors:

```
❯ clj -M:dev:drivers:ee -m metabase.core.bootstrap --mode checker --export /Users/dan/projects/work/representations/examples/v1 --schema-dir /Users/dan/projects/work/yaml-checked-files-v1/exports/sqlite-based/databases
[lots of logging removed]
Semantic Check Results
=====================
Total entities: 79
  OK: 76
  Errors: 0
  Unresolved refs: 1
  Native SQL errors: 2
  Issues: 0

Failures:
---------

=== Daily Order Summary [7XqqzlsonSq4KFyOvtrAm] ===
  Kind: transform
  UNRESOLVED REFERENCES:
  NATIVE SQL ERRORS:
    - {:type :syntax-error}
  SQL: SELECT
  DATE_TRUNC('day', CREATED_AT) AS order_date
  COUT(*) AS order_count,
  SU(TOTAL) AS total_revenue
FROM ORDERS
GROUP BY 1
  Status: NATIVE SQL ERRORS

=== Native Query - Card and Snippet References [HiBFSt0BNx5s5MxVDLLKB] ===
  Card ID: 94
  Tables: Sample Database.PUBLIC.ORDERS
  Fields: Sample Database.PUBLIC.ORDERS.CREATED_AT
  Source Cards: Basic Aggregations
  NATIVE SQL ERRORS:
    - {:type :missing-column, :name "created_attt", :source-entity-type :card, :source-entity-id "h5F2EjHsRd73Dqqh8sAtd"}
    - {:type :missing-column, :name "cooount", :source-entity-type :card, :source-entity-id "h5F2EjHsRd73Dqqh8sAtd"}
  Status: NATIVE SQL ERRORS

=== Product Analysis Report [dOc1PrOdAnAlYsIsRpTx2] ===
  Kind: document
  UNRESOLVED REFERENCES:
    - document-link: Q_jD-f-9clKLFZ2TfUG2g
  Status: MISSING REFS

❯ echo $?
1
```

## What It Validates

### Query validation (via `deps.analysis/check-entity`)

- **MBQL**: bad field/table/card references, broken joins
- **Native SQL**: missing columns, syntax errors, bad table references
- **Transforms**: query validation plus duplicate output column detection
- Source attribution on errors (which table or card caused the problem)

### Structural checks

- `collection_id`, `dashboard_id`, `document_id`, `parent_id` point to entities of the correct kind
- Dashboard layout: card refs exist, tab refs match, grid positions in bounds
- Document content: embedded card refs and entity links resolve
- Transform database refs exist in the schema
- Duplicate `entity_id`s across files

### Dependency tracking

Each card result includes a `:refs` map showing what it touches:

- `:tables` — database tables referenced
- `:fields` — specific fields used
- `:source-cards` — other cards used as data sources
- `:snippets` — native query snippets used
- `:measures`, `:metrics`, `:segments` — referenced by entity-id

These propagate transitively through source-card chains.

## CLI Options

```
--export PATH        Path to serdes export directory (collections/)
--schema-dir PATH    Path to database schema directory (databases/)
--output PATH        Write raw results to a file
--errors-only        Output only errors to stdout (concise format)
--help               Show help
```

`--errors-only` outputs one block per failing entity:

```
card: Number of Orders (entity_id: 8EdazRgPwfxdiltp7NCjS)
  unresolved field: Sample Database.PUBLIC.ORDERS.STARTED_AT
transform: Bad Transform (entity_id: 6Fdv3rO4bB5xyXusrVEGS)
  unresolved field: zomato..zomato.deliveryyyy
```

## Running Tests

```bash
clj -X:dev:test:ee:ee-dev :module enterprise/checker
```

Tests include unit tests (in-memory sources), integration tests (YAML fixtures),
and e2e tests against the baseline export at `test_resources/serialization_baseline`.

## REPL Usage

```clojure
(require '[metabase-enterprise.checker.semantic :as checker])

;; Check the baseline export
(def results
  (:results (checker/check "test_resources/serialization_baseline"
                           "test_resources/serialization_baseline/databases")))

(checker/summarize-results results)
;; => {:total 80, :ok 80, :errors 0, :unresolved 0, :native-errors 0, :issues 0}

;; Inspect specific entities
(select-keys results ["wpW9JO5MsHQd0-7WrR7gN"
                       "kBjQ5VXJ5z3vYSW72J6qa"
                       "dOc1PrOdAnAlYsIsRpTx2"])
;; =>
;; {"wpW9JO5MsHQd0-7WrR7gN"
;;  {:card-id 67,
;;   :name "Joins - Strategies and Compound Conditions",
;;   :entity-id "wpW9JO5MsHQd0-7WrR7gN",
;;   :refs {:tables ["Sample Database.PUBLIC.PRODUCTS"
;;                    "Sample Database.PUBLIC.REVIEWS"
;;                    "Sample Database.PUBLIC.ORDERS"
;;                    "Sample Database.PUBLIC.PEOPLE"],
;;          :fields ["Sample Database.PUBLIC.ORDERS.ID"
;;                    "Sample Database.PUBLIC.ORDERS.USER_ID"
;;                    ...19 fields across 4 tables...]}},
;;
;;  "kBjQ5VXJ5z3vYSW72J6qa"
;;  {:card-id 6,
;;   :name "Metric, Measure, and Segment References",
;;   :entity-id "kBjQ5VXJ5z3vYSW72J6qa",
;;   :refs {:tables ["Sample Database.PUBLIC.ORDERS"],
;;          :source-cards ["Total Revenue"],
;;          :measures ["DBap2523KuN4Lt-cYrUjF"],
;;          :metrics ["IW8kbqZVaMxdGtCM2F4U6"],
;;          :segments ["OaFXAvEzPvu9ZXW5PUMRa"]}},
;;
;;  "dOc1PrOdAnAlYsIsRpTx2"
;;  {:name "Product Analysis Report",
;;   :entity-id "dOc1PrOdAnAlYsIsRpTx2",
;;   :kind :document}}

;; Interactive iteration on a single card
(def ctx (checker/setup "test_resources/serialization_baseline"
                        "test_resources/serialization_baseline/databases"))
(checker/check-one ctx "HiBFSt0BNx5s5MxVDLLKB" :verbose true)
```

## Architecture

```
  SchemaSource ──┐                    ┌── query validation (deps.analysis)
  (databases,    │                    │
   tables,       ├─→ Store ─→ Provider ─→ MetadataProvider
   fields)       │   (IDs,     (lib        │
                 │    cache)    adapter)    └── structural checks
  AssetsSource ──┘                              (collection refs, dashboard
  (cards,                                        layout, document links)
   snippets,
   transforms,
   segments)
```

1. **Sources** provide entity data. `SchemaSource` resolves databases/tables/fields
   from `--schema-dir`. `AssetsSource` resolves cards/snippets/transforms/segments
   from `--export`. Both load YAML lazily.
2. **Store** combines both sources with a file index. Knows what entities exist,
   loads them on demand, assigns synthetic integer IDs (lib requires ints), caches
   everything.
3. **Provider** adapts the store into a `MetadataProvider` that `lib/query`
   understands. Converts raw YAML to lib metadata format, resolves portable refs
   to integer IDs, normalizes MBQL. Owns a mutable `current-db` atom set per
   entity check.
4. **Validation** runs query checks via `deps.analysis/check-entity` and
   structural checks on entity relationships.

### On-demand indexing

The schema directory can contain 500k+ field files. To avoid parsing them all
at startup:

- **Databases** (~40): indexed at startup by reading only the `name:` field
  from each database YAML via fast regex (no full parse).
- **Tables** (~22k): enumerated on demand by listing directories. Assigned
  lightweight IDs from directory paths via `ensure-table-id!` (no YAML parse).
  Full YAML is parsed only when table data is actually needed.
- **Fields** (~500k): resolved on demand from `<table>/fields/` directories.
  Never pre-indexed.
- **Segments/measures**: indexed from the export dir only (walks table
  directories for `segments/` and `measures/` subdirs). Not indexed in the
  schema dir.

Directory names are slugified (e.g. `analytics_data_warehouse` for
"Analytics Data Warehouse"). A `db-name->dir` mapping built from database
YAMLs handles the translation. Schema and table directory names match their
real names.

This brings setup time from ~64s to ~100ms.

### Running without an app DB

The checker runs the full QP compilation pipeline (template tag expansion,
snippet inlining, card ref resolution) but without a running Metabase instance.
Two things make this possible:

- **`qp.i/*skip-middleware-because-app-db-access*`** is bound to `true`, which
  skips middleware that queries the app DB for access control. Currently skipped:
  - **Impersonation** — connection role swapping based on user permissions
  - **Database routing** — routing queries to alternative destination databases

  These are security middleware, not semantic middleware. They control *who runs
  where*, not the shape of the query. Skipping them is safe for validation.

- **`mu.fn/*enforce*`** is bound to `false`, disabling Malli output schema
  enforcement so `lib/query` accepts valid MBQL clauses that the schemas don't
  fully enumerate.

This means native SQL validation resolves through `{{#card-ref}}` and
`{{snippet: Name}}` template tags using real data from the store, catching
missing columns with source attribution back to the originating card or snippet.

### Namespaces

- **`checker.source`** — `SchemaSource` and `AssetsSource` protocols
- **`checker.format.serdes`** — serdes directory walking, YAML extraction, file index building, `SerdesSource` (implements both protocols)
- **`checker.store`** — combines sources + index, ID registry, entity caches, lazy loading
- **`checker.provider`** — adapts store to lib `MetadataProvider`, data conversion, MBQL normalization, reference resolution
- **`checker.semantic`** — entity validation, result formatting, top-level API (`check`, `setup`, `check-one`)
- **`checker.cli`** — CLI entrypoint and argument parsing

## Performance

- **Setup**: ~100ms (reads ~40 database YAMLs)
- **Per entity**: ~1s average, cached after first access per database
- **First entity per database**: ~5-8s (table directory listing + ID assignment)
- **Complex native SQL**: 5-20s per entity (SQLGlot parsing bottleneck)
- **Full run** (177 entities, 40 databases, 22k tables): ~90s

### Parallelism

The architecture is ready for multi-threaded entity checking:
- The store (atom) is thread-safe
- Sources are stateless/immutable
- Each thread needs its own `provider` (owns mutable `current-db`)
- Dynamic bindings (`mu.fn/*enforce*`, `qp.i/*skip-middleware*`) are per-thread

To parallelize: create a provider per thread, replace the `for` in
`check-entities` with `pmap` or a thread pool.

## Roadmap

### Dependency graph

The checker computes forward edges per entity (what it depends on). The next
step is building a bidirectional dependency graph using
`metabase.graph.core/InMemoryGraph`.

The `dependencies` module already has the right pieces:

- **`calculation.clj`** — `upstream-deps:card`, `upstream-deps:transform`, etc.
  extract forward edges from resolved lib queries. These just call
  `lib/all-source-table-ids` etc., which work fine against our provider.
- **`analysis.clj`** — `check-entity` validates individual entities. The checker
  already uses this.
- **`metabase.graph.core`** — generic `Graph` protocol with `InMemoryGraph`,
  `transitive`, `find-cycle`, etc.

The plan:

1. Call `calculation.clj`'s `upstream-deps:*` functions against the checker's
   resolved entities (or align our `extract-refs-from-query` output to match)
2. Collect all edges into an adjacency map, wrap in `graph/in-memory`
3. Invert the map for the reverse graph
4. Return both from `checker/check`

This enables "who uses this snippet?", "what breaks if I rename this table?",
cycle detection via `graph/find-cycle`, and full impact analysis — all offline.

### Decouple dependencies module from app DB

`deps.analysis` and `deps.calculation` are clean — they operate on
MetadataProviders and lib queries with no toucan2 dependency. But
`deps.core` and `deps.models.dependency` are tightly coupled to the app DB
(toucan2, `:model/Dependency` table, etc.).

Currently the checker imports `deps.analysis` directly, avoiding the toucan2
dependency chain. For the graph work, we'll also need `deps.calculation`
(also clean) and `metabase.graph.core` (also clean).

The goal is that the "pure analysis" side of the dependencies module
(`analysis.clj`, `calculation.clj`) stays usable without an app DB connection,
while the "storage" side (`models/dependency.clj`, `events.clj`) stays in leaf
namespaces that the checker never touches. This mirrors the pattern in
`models.serialization` where we separated the resolve protocols from the
DB-backed implementations.

### Merge native errors into bad-refs

`:native-errors` (from SQL parsing) and `:bad-refs` (from MBQL analysis) are
both query issues found through different code paths. Consider merging them
into a single `:query-issues` key. The other result keys (`:error` for fatal
failures, `:unresolved` for missing schema refs) are genuinely different
categories and should stay separate.

### Table-type template tag validation

Native queries with `{{table_one}}`-style template tags (type: table) currently
get placeholder substitution — column validation is skipped because the actual
table is unknown. The template tag contains a `table-id` that could be resolved
via the provider to substitute the real table name, enabling full column
validation against the schema.

### Schema mismatch false positives

`sql-tools/validate-query` defaults unqualified tables to `default-schema`,
which returns `"public"` for schema-less databases where tables have `nil`
schema. Root cause is in `sql-tools`, not the checker.
