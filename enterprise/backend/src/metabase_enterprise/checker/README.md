# Checker Module

Validates serdes exports without a running Metabase instance or database.

## Running Tests

```bash
clj -X:dev:test:ee:ee-dev :module enterprise/checker
```

## Namespaces

### `checker.checker` - Query Validation

Validates card queries using MLv2 (`metabase.lib`). Builds a `MetadataProvider` from YAML files so `lib/query` and `lib/find-bad-refs` work without a database.

**Public API:**
- `(check export-dir)` - Validate all cards, return `{entity-id -> result}`
- `(summarize-results results)` - Count by status: `:ok`, `:error`, `:unresolved`, `:issues`
- `(write-results! results file)` - Human-readable report

**How it works:**
1. Calls `format.serdes/build-file-index` to map paths to files
2. Assigns integer IDs to entities on first reference
3. Converts YAML to lib metadata format on demand
4. Resolves portable refs (e.g., `["DB" "schema" "table"]`) to IDs during query conversion
5. Tracks unresolved refs separately from lib validation errors

### `checker.structural` - Schema Validation

Fast structural validation using Malli schemas. No query processing, just shape checking.

**Public API:**
- `(check export-dir)` - Validate all YAML files, print summary
- `(validate schema data)` - Validate data against a Malli schema
- `(export-json-schemas! dir)` - Export schemas as JSON Schema for external tools

**Schemas defined:** `Database`, `Table`, `Field`, `Card`, `Dashboard`, `Collection`

Includes typo detection - if you have `nname` instead of `name`, it tells you.

### `checker.format.serdes` - File Index

Knows the serdes directory layout. Used by both checkers.

**Public API:**
- `(build-file-index export-dir)` - Returns index map with:
  - `:db-name->file` - `"Sample Database"` → file path
  - `:table-path->file` - `["DB" "schema" "table"]` → file path
  - `:field-path->file` - `["DB" "schema" "table" "field"]` → file path
  - `:card-entity-id->file` - `"abc123"` → file path
- `(load-yaml path)` - Parse YAML file
- `(walk-yaml-files export-dir f)` - Call `(f path entity-type)` for each YAML
- `(infer-entity-type path)` - Returns `:database`, `:table`, `:field`, `:card`, etc.

## Adding a New Export Format

Create a new namespace under `format/` (e.g., `format.json`, `format.api`).

**Required functions:**

```clojure
(defn build-file-index [source]
  ;; Return map with these keys:
  {:db-name->file {}           ; string -> file/url
   :table-path->file {}        ; [db schema table] -> file/url
   :field-path->file {}        ; [db schema table field] -> file/url
   :card-entity-id->file {}})  ; entity-id -> file/url

(defn load-yaml [path]
  ;; Return parsed data as Clojure map
  )
```

The checker doesn't care where data comes from. It just needs:
1. An index mapping identifiers to locations
2. A way to load content from those locations

**Key constraint:** Table paths are `[db-name schema-name table-name]` where `schema-name` can be `nil` for schema-less databases (SQLite, etc.). Field paths extend this with field name.

## Assumptions

- One database per export (first one found is used for the metadata provider)
- Entity IDs are unique within their type
- Portable references in queries follow serdes format: `["DB" "schema" "table"]` for tables, `["DB" "schema" "table" "field"]` for fields
- Cards reference databases by name string, not ID

## Load Time

Current load time is ~8 seconds due to `metabase.lib.core` and `metabase.models.serialization`. The lib dependency is required for query validation. The models dependency could be extracted (~3.5s savings) but isn't prioritized yet.
