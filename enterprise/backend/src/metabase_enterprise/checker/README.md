# Checker Module

Validates serdes YAML card queries and file structure without a running Metabase instance.

## Quick Start

```bash
# Card query validation (are the queries in the YAML files valid?)
clj -M:dev:drivers:ee -m metabase.core.bootstrap \
  --mode checker --checker cards \
  --export /path/to/export \
  --schema-dir /path/to/databases

# Structural validation (are the YAML files well-formed?)
clj -M:dev:drivers:ee -m metabase.core.bootstrap \
  --mode checker --checker structural \
  --export /path/to/export
```

Or with a built jar:

```bash
java -jar metabase.jar --mode checker --checker cards \
  --export /path/to/export --schema-dir /path/to/databases
```

## Checkers

### `cards` — Query Validation

Validates card queries using MLv2 (`metabase.lib`). Catches:
- References to nonexistent databases, tables, or fields
- Malformed MBQL queries
- Bad joins, broken field refs
- Native SQL errors (missing columns, bad table references)

```bash
# Basic usage — two directories are always required
--checker cards --export /path/to/export --schema-dir /path/to/databases

# Errors only — clean output for LLM consumption
--checker cards --export /path/to/export --schema-dir /path/to/databases --errors-only
```

**`--export`** points at the serdes export directory containing cards (in `collections/`).

**`--schema-dir`** points at the directory containing database schema entries. This is the directory with database subdirectories directly:

```
/path/to/databases/
  Sample Database/
    Sample Database.yaml
    schemas/
      PUBLIC/
        tables/
          ORDERS/
            ORDERS.yaml
            fields/
              ID.yaml
              TOTAL.yaml
```

**`--errors-only`** outputs just errors to stdout, one block per failing card:

```
card: Number of Orders (entity_id: 8EdazRgPwfxdiltp7NCjS)
  unresolved field: Sample Database.PUBLIC.ORDERS.STARTED_AT
card: Delivery by Rating Color (entity_id: 6Fdv3rO4bB5xyXusrVEGS)
  unresolved field: zomato..zomato.deliveryyyy
```

### `structural` — Schema Validation

Fast Malli-based validation that YAML files are well-formed. No query processing. Catches missing required keys, type errors, and typos (via Levenshtein distance).

```bash
--checker structural --export /path/to/export

# Errors only
--checker structural --export /path/to/export --errors-only
```

## All CLI Options

```
--checker CHECKER    Which checker to run: cards, structural
--export PATH        Path to serdes export directory (cards/collections)
--schema-dir PATH    Database schema directory (required for cards checker)
--output PATH        Write raw results to a file
--errors-only        Output only errors to stdout (for LLM consumption)
--help               Show help
```

Exit code is 0 when all checks pass, 1 when any fail.

## Running Tests

```bash
clj -X:dev:test:ee:ee-dev :module enterprise/checker
```

## Namespaces

- **`checker.source`** — `MetadataSource` protocol (resolve-database, resolve-table, resolve-field, resolve-card) and `CompositeSource` for combining db and card sources
- **`checker.store`** — File index, ID registry, entity caches. Holds the source, assigns synthetic IDs, loads entities lazily
- **`checker.checker`** — Query validation engine. Builds a `MetadataProvider` from a store, runs `lib/query` and `lib/find-bad-refs`
- **`checker.native`** — Native SQL validation via sql-parsing and sql-tools
- **`checker.structural`** — Malli schema validation, typo detection
- **`checker.cli`** — CLI entrypoint, argument parsing
- **`checker.format.serdes`** — Serdes directory layout: file walking, index building, `MetadataSource` implementation

## How Card Checking Works

1. Build a file index by walking the serdes directory tree
2. Create a `MetadataSource` backed by the index (loads YAML lazily on resolve)
3. For split directories, compose a db source (from `--schema-dir`) and card source (from `--export`) via `CompositeSource`
4. The store holds the index and assigns synthetic integer IDs to entities (lib requires them)
5. Convert serdes portable refs (path vectors) to integer IDs
6. Unresolved refs get sentinel IDs so the query can still be constructed
7. `lib/query` builds and validates the query
8. `lib/find-bad-refs` catches references to nonexistent metadata
9. Native SQL queries are compiled via QP and parsed with SQLGlot for table/field refs
