# Checker Module

Validates card queries without a running Metabase instance or database.

## Running Tests

```bash
clj -X:dev:test:ee:ee-dev :module enterprise/checker
```

## Architecture

Two protocols separate concerns:

```
Checker --> EntityResolver (source.clj)
                 ^
                 |
       +---------+---------+
       |         |         |
    Memory    File       AppDb
    (reify)   Resolver   (future)
                 |
                 v
            FolderLayout (future)
                 ^
                 |
          +------+------+
          |             |
       Serdes        Simple
       (current)     (future)
```

**EntityResolver** - What the checker needs: "Does this reference exist? Give me its data."

**FolderLayout** - How file-based formats work: "Given a reference, find it in the directory."

Currently serdes format combines both in `format/serdes.clj`. See `DESIGN.md` for the planned separation.

## Namespaces

### `checker.source` - EntityResolver Protocol

```clojure
(defprotocol MetadataSource
  (resolve-database [this db-name])
  (resolve-table [this table-path])    ; table-path is [db schema table]
  (resolve-field [this field-path])    ; field-path is [db schema table field]
  (resolve-card [this entity-id]))
```

Each returns entity data or nil. The checker doesn't know where data comes from.

### `checker.checker` - Query Validation

Validates card queries using MLv2 (`metabase.lib`).

**Public API:**
- `(check-cards source enumerators card-ids)` - Validate specific cards
- `(make-provider session)` - Create a MetadataProvider for lib
- `(summarize-results results)` - Count by status
- `(write-results! results file)` - Human-readable report

**How it works:**
1. Creates a session with source + enumerators
2. Assigns integer IDs to entities (lib requires them)
3. Builds MetadataProvider that calls source on demand
4. Uses `lib/query` and `lib/find-bad-refs` to validate
5. Tracks unresolved refs separately from lib errors

### `checker.structural` - Schema Validation

Fast structural validation using Malli schemas. No query processing, just shape checking.

**Public API:**
- `(check export-dir)` - Validate all YAML files, print summary
- `(validate schema data)` - Validate data against a Malli schema
- `(export-json-schemas! dir)` - Export schemas as JSON Schema

Includes typo detection - if you have `nname` instead of `name`, it tells you.

### `checker.format.serdes` - Serdes Format

Implements `MetadataSource` for serdes export directories. Knows the baroque serdes layout.

**Public API:**
- `(make-source export-dir)` - Create source for a serdes export
- `(check source)` - Check all cards in source
- `(check-cards source card-ids)` - Check specific cards
- `(make-enumerators source)` - Create enumerators for checker

**Directory layout:**
```
databases/<db-name>/<db-name>.yaml
databases/<db-name>/schemas/<schema>/tables/<table>/<table>.yaml
databases/<db-name>/schemas/<schema>/tables/<table>/fields/<field>.yaml
collections/<eid>_<slug>/cards/<eid>_<slug>.yaml
```

## Usage

```clojure
(require '[metabase-enterprise.checker.format.serdes :as serdes-format])

;; Check all cards in a serdes export
(def source (serdes-format/make-source "export-dir"))
(def results (serdes-format/check source))
(checker/summarize-results results)

;; Check specific cards
(serdes-format/check-cards source ["card-entity-id-1" "card-entity-id-2"])
```

For tests, use in-memory sources:

```clojure
(defn make-memory-source [{:keys [databases tables fields cards]}]
  (reify source/MetadataSource
    (resolve-database [_ db-name] (get databases db-name))
    (resolve-table [_ path] (get tables path))
    (resolve-field [_ path] (get fields path))
    (resolve-card [_ eid] (get cards eid))))
```

## Load Time

~8 seconds due to `metabase.lib.core` and `metabase.models.serialization`.

- lib is required for query validation
- models could be extracted (~3.5s savings) - tracked in Linear

## Future Work

See `DESIGN.md` for planned improvements:
- Separate FolderLayout protocol for file organization
- Simple LLM-friendly format with flat structure
- Multi-entity files (`cards.yaml` with array)
- AppDb resolver for running instances
