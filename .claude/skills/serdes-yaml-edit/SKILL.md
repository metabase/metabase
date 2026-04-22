---
name: serdes-yaml-edit
description: Edit Metabase serdes YAML files (cards, dashboards, databases) with correct portable references and structural conventions. Use when modifying exported YAML content.
---

# Serdes YAML Edit Skill

## Golden Rule

**Run both checkers after every edit.** No exceptions. Do not batch multiple edits before validating.

```bash
clojure -M:run:ee --mode checker --checker structural --export /path/to/export-dir
clojure -M:run:ee --mode checker --checker cards --export /path/to/export-dir
```

If either checker fails, fix the issue before making further edits.

## Portable References

Serdes YAML uses portable references instead of integer IDs. This is the most important concept for editing.

### Database references
String name: `"Sample Database"`

### Table references
Array of `[database, schema, table]`:
```yaml
table_id:
- Sample Database
- PUBLIC
- ACCOUNTS
```

### Field references
Array of `[database, schema, table, field]`:
```yaml
id:
- Sample Database
- PUBLIC
- ACCOUNTS
- EMAIL
```

### Field refs in queries
```yaml
field_ref:
- field
- - Sample Database
  - PUBLIC
  - ACCOUNTS
  - EMAIL
- null
```
The outer array is `[field, <field-path>, <options>]`. The options are usually `null`.

### Card references
Entity ID string (21 characters): `"Qk5TgsNx4ubXIUtsQmT8G"`

### Source table in queries
```yaml
dataset_query:
  database: Sample Database
  query:
    source-table:
    - Sample Database
    - PUBLIC
    - ACCOUNTS
  type: query
```

## Safe Edits (low risk)

These rarely break validation:
- `name` - card/dashboard display name
- `description` - card/dashboard description
- `display` - visualization type (table, bar, line, pie, etc.)
- `visualization_settings` - chart configuration
- `archived` - true/false
- `collection_id` - move to a different collection (use entity_id of target collection, or null for root)

## Structural Edits (must match schema)

These must use valid portable refs and will be caught by the cards checker if wrong:
- `dataset_query` - the query definition
- `result_metadata` - column metadata (must match the query's output columns)
- `table_id` - must reference a table that exists in the export
- `database_id` - must reference a database that exists in the export

## Editing result_metadata

Each entry in `result_metadata` describes an output column. When changing a query's source table or fields, you must update result_metadata to match. Each field entry needs at minimum:
- `name` - column name (e.g., `EMAIL`)
- `base_type` - Metabase type (e.g., `type/Text`, `type/Integer`, `type/DateTime`)
- `display_name` - human-readable name
- `field_ref` - portable field reference
- `id` - portable field path
- `table_id` - portable table path
- `source` - usually `fields`

## Common Operations

### Rename a card
Change `name:` at the top level. Safe, no ref changes needed.

### Change a card's source table
Update all of these consistently:
1. `table_id` - top-level
2. `dataset_query.query.source-table` - in the query
3. `result_metadata` - every field entry's `id`, `field_ref`, and `table_id`

### Add a filter to a structured query
```yaml
dataset_query:
  database: Sample Database
  query:
    source-table:
    - Sample Database
    - PUBLIC
    - ORDERS
    filter:
    - ">"
    - - field
      - - Sample Database
        - PUBLIC
        - ORDERS
        - TOTAL
      - null
    - 100
  type: query
```

### Change visualization type
```yaml
display: bar    # was: table
```
Valid types: `table`, `bar`, `line`, `pie`, `scalar`, `row`, `area`, `combo`, `scatter`, `funnel`, `map`, `pivot`, `progress`, `gauge`, `waterfall`

## Looking Up Valid References

The export directory IS the reference catalog. When you need to find the correct name for a database, table, or field, look it up directly from the export.

### List valid databases
```bash
ls databases/
```
Each entry is a database name (directory for serdes format, .yaml for concise format).

### List valid tables for a database
```bash
ls databases/<db-name>/schemas/<schema>/tables/
```
Example: `ls databases/Sample\ Database/schemas/PUBLIC/tables/` shows `ACCOUNTS`, `ORDERS`, `PRODUCTS`, etc.

### List valid fields for a table
```bash
ls databases/<db-name>/schemas/<schema>/tables/<table>/fields/
```
Example: `ls databases/Sample\ Database/schemas/PUBLIC/tables/PRODUCTS/fields/` shows `CATEGORY.yaml`, `TITLE.yaml`, `PRICE.yaml`, etc. The filename (minus `.yaml`) is the field name.

### Find card entity IDs
Card filenames encode the entity ID: `<entity-id>_<slug>.yaml`. The entity ID is the part before the first underscore (21 characters).

## Self-Healing Loop

When a checker reports errors, follow this loop:

1. **Read the error message** - it tells you what's wrong and often suggests the fix
2. **Look up the correct value** from the export directory (see "Looking Up Valid References" above)
3. **Fix the YAML**
4. **Re-run both checkers**
5. **Repeat until clean**

Do not guess at fixes. Always look up the correct value from the export.

## Understanding Checker Errors

### Structural checker errors

The structural checker validates YAML shape against Malli schemas. Common errors:

**Missing required key with typo suggestion:**
```
Missing required key 'name' - found 'nameee' which may be a typo
```
Fix: rename the typo'd key back to the correct name. The checker tells you what it expected and what it found.

**Wrong type:**
```
'archived' should be a boolean, got: "yes"
```
Fix: use `true`/`false`, not strings.

**Unknown key:**
```
Unknown key 'foobar' in card
```
Fix: remove the key, or check if it's a typo of a known key.

### Cards checker errors

The cards checker validates that queries resolve against exported metadata. Error types:

**UNRESOLVED REFERENCES:**
```
UNRESOLVED REFERENCES:
  - field: Sample Database.PUBLIC.PRODUCTS.CATEGORYYY
```
The dotted path tells you exactly which reference failed. Look up the correct value:
- Last segment is the field name - check `databases/.../tables/<table>/fields/`
- Third segment is the table name - check `databases/.../schemas/<schema>/tables/`
- First segment is the database name - check `databases/`

**ERROR (query construction failed):**
```
ERROR: Error creating query from legacy query: Invalid output: ...
```
Usually means the query structure is malformed. This often follows unresolved references - fix the refs first, then re-check.

**ERROR (nil name):**
```
ERROR: Invalid output: {:name ["should be a string, got: nil"]}
```
The card is missing its `name` field (likely a structural issue that also affects the cards checker).

### Exit codes

- Exit 0: all checks passed
- Exit 1: one or more failures

## File Naming Convention

Card files: `collections/<collection-path>/cards/<entity-id>_<slug>.yaml`

The filename slug should match the card name (lowercase, underscored). If you rename a card, consider renaming the file to match, though import works on entity_id not filename.

## What NOT to Edit

- `entity_id` - this is the identity of the object, changing it creates a new object on import
- `serdes/meta` - internal serdes metadata, leave it alone
- `created_at` - timestamp, no reason to change
- `creator_id` - email reference, leave it
- `metabase_version` - informational, leave it
