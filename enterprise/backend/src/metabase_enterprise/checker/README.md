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

1. **Sources** — `SchemaSource` resolves databases/tables/fields from `--schema-dir`. `AssetsSource` resolves cards/snippets/transforms/segments from `--export`. Both load YAML lazily on resolve.
2. **Store** — combines both sources with a file index. Knows what entities exist, loads them on demand, assigns synthetic integer IDs (lib requires ints), caches everything.
3. **Provider** — adapts the store into a `MetadataProvider` that `lib/query` understands. Converts raw YAML maps to lib metadata format, resolves portable refs to integer IDs, normalizes MBQL.
4. **Validation** — query validation via `deps.analysis/check-entity` (MBQL + native SQL), plus structural checks (collection refs, dashboard layout, document links).
5. **Results** — aggregate, format, and output.

### Namespaces

- **`checker.source`** — `SchemaSource` and `AssetsSource` protocols
- **`checker.format.serdes`** — serdes directory walking, YAML extraction, file index building, `SerdesSource` (implements both protocols)
- **`checker.store`** — the store: combines sources + index, ID registry, entity caches, lazy loading
- **`checker.provider`** — adapts store → lib `MetadataProvider`. Data conversion, MBQL normalization, reference resolution
- **`checker.semantic`** — entity validation (structural checks, query checks via deps.analysis), result formatting, CLI orchestration
- **`checker.cli`** — CLI entrypoint and argument parsing
