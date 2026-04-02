# Checker Module

Validates serdes YAML exports without a running Metabase instance or database connection.

## Quick Start

```bash
clj -M:dev:drivers:ee -m metabase.core.bootstrap \
  --mode checker \
  --export /path/to/export \
  --schema-dir /path/to/databases
```

Or with a built jar:

```bash
java -jar metabase.jar --mode checker \
  --export /path/to/export --schema-dir /path/to/databases
```

## What It Does

The checker bridges serdes YAML files into Metabase's `lib/metadata` system, then runs the same validation infrastructure that the app uses at runtime (`deps.analysis/check-entity`). It also runs structural checks that are specific to exported content.

### Query validation (via `deps.analysis/check-entity`)

- MBQL: bad field/table/card references, broken joins
- Native SQL: missing columns, syntax errors, bad table references
- Transforms: query validation plus duplicate output column detection
- Source attribution on errors (which table or card caused the problem)

### Structural checks (checker-specific)

- `collection_id`, `dashboard_id`, `document_id`, `parent_id` point to entities of the correct kind
- Dashboard layout: card refs exist, tab refs match, grid positions are in bounds
- Document content: embedded card refs and entity links resolve
- Transform database refs exist in the schema
- Duplicate `entity_id`s across files

## CLI Options

```
--export PATH        Path to serdes export directory (collections/)
--schema-dir PATH    Path to database schema directory (databases/)
--output PATH        Write raw results to a file
--errors-only        Output only errors to stdout (concise format)
--help               Show help
```

**`--export`** points at the serdes export directory containing entities (cards, dashboards, etc. in `collections/`).

**`--schema-dir`** points at the directory containing database schema YAML files.

**`--errors-only`** outputs one block per failing entity:

```
card: Number of Orders (entity_id: 8EdazRgPwfxdiltp7NCjS)
  unresolved field: Sample Database.PUBLIC.ORDERS.STARTED_AT
card: Delivery by Rating Color (entity_id: 6Fdv3rO4bB5xyXusrVEGS)
  unresolved field: zomato..zomato.deliveryyyy
```

Exit code is 0 when all checks pass, 1 when any fail.

## Running Tests

```bash
clj -X:dev:test:ee:ee-dev :module enterprise/checker
```

## Architecture

### How checking works

1. **Index** — walk YAML directories, build a file index of all entities by kind and ref
2. **Source** — create `MetadataSource` implementations backed by the index (YAML loaded lazily on resolve). A `CompositeSource` combines db schemas from `--schema-dir` and entities from `--export`
3. **Store** — assign synthetic integer IDs to portable refs (lib requires integer IDs). Cache loaded entities. Track bidirectional ref-to-ID mappings
4. **Provider** — a `MetadataProvider` backed by the store converts YAML data to lib metadata format, resolving portable refs (path vectors like `["DB" "schema" "table"]`) to integer IDs
5. **Query validation** — delegate to `deps.analysis/check-entity` which uses `lib/find-bad-refs` for MBQL and `deps.native-validation` for SQL
6. **Structural checks** — validate entity relationships (collection_id, dashboard layout, document links) that query analysis doesn't cover
7. **Results** — aggregate, format, and output

### Namespaces

- **`checker.format.serdes`** — serdes directory walking, YAML extraction, file index building, `SerdesSource` implementation
- **`checker.source`** — `MetadataSource` protocol and `CompositeSource` for combining db and card sources
- **`checker.store`** — mutable state: file index, bidirectional ID registry, entity caches. Loads entities lazily from the source
- **`checker.semantic`** — the bridge. Converts YAML entities to lib metadata, builds a `MetadataProvider`, runs structural checks, delegates query validation to `deps.analysis/check-entity`, formats results
- **`checker.native`** — standalone SQL utilities (ref extraction, structural validation). Not called by the checker pipeline; `deps.analysis` handles query validation internally
- **`checker.cli`** — CLI entrypoint and argument parsing
