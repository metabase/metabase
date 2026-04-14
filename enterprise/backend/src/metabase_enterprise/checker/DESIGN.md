# Checker Design

## Goal

Validate entity queries work correctly, regardless of where the data comes from:
- **Files** (serdes export, jekyll-mode content)
- **App DB** (existing Metabase instance)
- **Memory** (tests, LLM iteration)

Enable rapid iteration on file formats by LLMs writing content.

Ultimately: Metabase serves content from files ("jekyll mode"). LLMs write those files. Checkers validate before serving.

## Architecture

```
              SchemaSource protocol     AssetsSource protocol
                    ^                        ^
                    |                        |
              SerdesSource             SerdesSource
              (databases dir)          (export dir)
                    |                        |
              on-demand FS             file index
              resolution               + YAML loading
```

### Source Protocols (`source.clj`)

Two protocols separate schema resolution from asset resolution:

- **SchemaSource** — resolves databases, tables, fields. Provides enumeration
  (`all-database-names`, `tables-for-database`, `fields-for-table`).
- **AssetsSource** — resolves cards, snippets, transforms, segments, dashboards,
  collections, documents, measures.

### SerdesSource (`format/serdes.clj`)

A single `SerdesSource` type implements both protocols. It is created in two modes:

- `make-database-source` — for the `--schema-dir` directory. Indexes only databases
  (~40 YAML reads). Tables and fields are resolved on-demand from the filesystem
  using `db-name->dir` mapping to handle slugified directory names.
- `make-source` — for the `--export` directory. Indexes databases, cards, dashboards,
  collections, transforms, snippets, segments, and measures. Also walks table
  directories for segments and measures.

Key design decision: **fields and tables are never pre-indexed**. The schema directory
can contain 500k+ field files. Instead, the source derives metadata from the directory
structure on demand:
- Database names: read from `<db-dir>/<db-dir>.yaml` `name:` field (fast regex, no full parse)
- Table paths: listed from `schemas/<schema>/tables/` and `tables/` directories
- Field paths: listed from `<table>/fields/` directories
- `db-name->dir` mapping: real name → slugified directory name

### Store (`store.clj`)

The store is an atom holding:
- A **SchemaSource** for resolving databases, tables, and fields
- An **AssetsSource** for resolving cards, snippets, transforms, and segments
- A **file index** (`{:database {ref file}, :card {ref file}, ...}`) for enumeration
- A bidirectional **ID registry** (portable refs <-> synthetic integer IDs)
- **Entity caches** (raw data with `:id` stamped on)

Entities are loaded lazily from sources and cached with assigned IDs.
The store is passed explicitly — no dynamic vars.

`ensure-table-id!` assigns an ID and caches minimal metadata from the path
(name, schema, db_id) without parsing the table YAML. `load-table!` does a
full YAML parse when needed. This avoids parsing thousands of table YAMLs
just to enumerate tables.

### MetadataProvider (`provider.clj`)

A `MetadataProvider` backed by the store serves `lib/query`. It delegates
enumeration to the source (via the store) and entity data to the store's cache.
This is how MLv2 sees the YAML-backed metadata.

The provider owns a mutable `current-db` atom set per entity check. This is the
main blocker for parallelism — each thread needs its own provider instance.

### Sentinel IDs

When an entity references a field or table that doesn't exist in the schema, the
checker assigns a **sentinel ID** instead of failing. This lets the query be
constructed so `lib/find-bad-refs` can report the issue with context. The sentinel
ID has no backing metadata in the provider, so lib flags it.

This is a core feature — it means entities are always validated as far as possible,
and missing schema entries produce clear "unresolved reference" errors rather than
opaque crashes.

## Format: Serdes Only

The checker uses the serdes directory layout as its single format. Two directories
are provided separately:
- `--schema-dir` — the databases directory (db/table/field YAML files)
- `--export` — the export directory (entities in `collections/`, `transforms/`, etc.)

## What Varies vs What's Shared

### Varies (format concern — in `format/serdes.clj`)
- Directory structure and file naming
- How the file index is built
- How entity-ids are extracted from card files
- How slugified directory names map to real entity names

### Shared (checker concern)
- Source protocols (`SchemaSource`, `AssetsSource`)
- ID assignment (synthetic integer IDs for lib)
- lib validation (`lib/query`, `lib/find-bad-refs`)
- Sentinel IDs for unresolved references
- Native SQL validation (`sql-tools`)
- Structural validation

## Current Namespace Layout

```
source.clj          — SchemaSource + AssetsSource protocols
store.clj           — ID registry + entity caches + source delegation
provider.clj        — MetadataProvider, reference resolution, ISettableDatabase
semantic.clj        — Entity validation orchestration, CLI-facing check/setup/check-one
cli.clj             — CLI entrypoint (--mode checker)
format/serdes.clj   — Serdes directory walking, index building, SerdesSource
```

## Performance

Indexing: ~100ms for 40 databases (reads only database YAMLs).

Per-entity check: ~1s average. First entity per database pays ~5-8s for table
directory listing + ID assignment (no YAML parsing). Complex native SQL queries
can take 5-20s due to SQLGlot parsing.

### Parallelism

The architecture is ready for multi-threaded entity checking:
- The store (atom) is thread-safe
- Sources are stateless/immutable
- Each thread needs its own `provider` (owns mutable `current-db`)
- Dynamic bindings (`mu.fn/*enforce*`, `qp.i/*skip-middleware*`) are per-thread

To parallelize: create a provider per thread, replace `for` with `pmap` or
a thread pool in `check-entities`.
