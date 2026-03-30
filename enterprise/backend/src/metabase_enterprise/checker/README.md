# Checker Module

Validates serdes YAML exports without a running Metabase instance.

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

## What It Checks

Validates that entity references resolve and queries are correct. Uses MLv2 (`metabase.lib`) and native SQL analysis. Catches:
- References to nonexistent databases, tables, or fields
- Malformed MBQL queries
- Bad joins, broken field refs
- Native SQL errors (missing columns, bad table references)
- Invalid `collection_id` and `dashboard_id` references
- Dashboard card refs (card_id, tab refs, grid bounds)
- Duplicate entity_ids across files

**`--export`** points at the serdes export directory containing entities (cards in `collections/`).

**`--schema-dir`** points at the directory containing database schema entries:

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

**`--errors-only`** outputs just errors to stdout, one block per failing entity:

```
card: Number of Orders (entity_id: 8EdazRgPwfxdiltp7NCjS)
  unresolved field: Sample Database.PUBLIC.ORDERS.STARTED_AT
card: Delivery by Rating Color (entity_id: 6Fdv3rO4bB5xyXusrVEGS)
  unresolved field: zomato..zomato.deliveryyyy
```

## All CLI Options

```
--export PATH        Path to serdes export directory
--schema-dir PATH    Database schema directory
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
- **`checker.semantic`** — Semantic validation engine. Builds a `MetadataProvider` from a store, runs `lib/query` and `lib/find-bad-refs`
- **`checker.native`** — Native SQL validation via sql-parsing and sql-tools
- **`checker.cli`** — CLI entrypoint, argument parsing
- **`checker.format.serdes`** — Serdes directory layout: file walking, index building, `MetadataSource` implementation

## How Checking Works

1. Build a file index by walking the serdes directory tree
2. Create a `MetadataSource` backed by the index (loads YAML lazily on resolve)
3. Compose a db source (from `--schema-dir`) and card source (from `--export`) via `CompositeSource`
4. The store holds the index and assigns synthetic integer IDs to entities (lib requires them)
5. Convert serdes portable refs (path vectors) to integer IDs
6. Unresolved refs get sentinel IDs so the query can still be constructed
7. `lib/query` builds and validates the query
8. `lib/find-bad-refs` catches references to nonexistent metadata
9. Native SQL queries are compiled via QP and parsed with SQLGlot for table/field refs
10. Dashboards: validate card_id refs, tab refs, grid bounds
11. All entities: validate collection_id, dashboard_id, detect duplicate entity_ids
