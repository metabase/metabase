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
java -jar metabase.jar --mode checker --checker cards --export /path/to/export
```

## Checkers

### `cards` — Query Validation

Validates card queries using MLv2 (`metabase.lib`). Catches:
- References to nonexistent databases, tables, or fields
- Malformed MBQL queries
- Bad joins, broken field refs

```bash
# Schemas colocated in export dir (under databases/)
--checker cards --export /path/to/export

# Schemas in a separate directory
--checker cards --export /path/to/export --schema-dir /path/to/databases

# Errors only — clean output for LLM consumption
--checker cards --export /path/to/export --errors-only

# Lenient mode — fabricate metadata, don't require schema files
--checker cards --export /path/to/export --lenient
```

**`--schema-dir`** points directly at the directory containing database entries, not a parent with a `databases/` subdirectory:

```
/path/to/databases/
  Sample Database/          # serdes format: subdirectories
    Sample Database.yaml
    schemas/
      PUBLIC/
        tables/...
```

**`--errors-only`** outputs just errors to stdout, one block per failing card:

```
card: Number of Orders (entity_id: 8EdazRgPwfxdiltp7NCjS)
  unresolved field: Sample Database.PUBLIC.ORDERS.STARTED_AT
card: Delivery by Rating Color (entity_id: 6Fdv3rO4bB5xyXusrVEGS)
  unresolved field: zomato..zomato.deliveryyyy
```

**`--lenient`** skips schema files entirely and fabricates metadata on demand. Useful when you have cards but no schema files yet. Writes a manifest of all referenced entities.

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
--schema-dir PATH    Database schema directory (defaults to <export>/databases/)
--output PATH        Write raw results to a file
--errors-only        Output only errors to stdout (for LLM consumption)
--manifest PATH      Write manifest YAML (lenient mode only)
--lenient            Fabricate metadata on demand, skip schema files
--help               Show help
```

Exit code is 0 when all checks pass, 1 when any fail.

## Running Tests

```bash
clj -X:dev:test:ee:ee-dev :module enterprise/checker
```

## Namespaces

- **`checker.source`** — `MetadataSource` protocol: resolve-database, resolve-table, resolve-field, resolve-card
- **`checker.checker`** — Query validation engine. Builds a `MetadataProvider` from a source, runs `lib/query` and `lib/find-bad-refs`
- **`checker.structural`** — Malli schema validation, typo detection, JSON Schema export
- **`checker.cli`** — CLI entrypoint, argument parsing
- **`checker.format.serdes`** — `MetadataSource` for serdes directory layout
- **`checker.format.concise`** — `MetadataSource` for concise YAML format (one file per database)
- **`checker.format.hybrid`** — Auto-detection, source composition, `--schema-dir` support
- **`checker.format.lenient`** — Fabricates metadata on demand, tracks refs for manifest

## How Card Checking Works

1. Auto-detect format (serdes, concise, hybrid) or use `--schema-dir`
2. Assign synthetic integer IDs to entities (lib requires them)
3. Convert serdes portable refs (path vectors) to integer IDs
4. Unresolved refs get sentinel IDs so the query can still be constructed
5. `lib/query` builds and validates the query
6. `lib/find-bad-refs` catches references to nonexistent metadata
7. Native SQL queries are compiled via QP and parsed with SQLGlot for table/field refs
