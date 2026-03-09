---
name: discovering-data
description: Discovers databases, tables, fields, and existing content in Metabase. Use when exploring data sources, understanding schema, or searching for existing dashboards and questions before building new analytics.
---

# Discovering Data

Always start here before creating transforms, questions, or dashboards.

@./../_shared/common-patterns.md

## list-databases

List all databases, optionally including their tables.

```bash
# Compact list
./metabase-agent list-databases --fields id,name,engine

# Include table names (recommended first step)
./metabase-agent list-databases --include tables
```

Output shape:
```json
[{"id": 1, "name": "Production DB", "engine": "postgres",
  "tables": [{"id": 5, "name": "orders", "schema": "public"}]}]
```

This gives you `database_id` and `table_id` values needed by all other commands.

## get-database

Full database metadata with every table and field.

```bash
./metabase-agent get-database 1
```

Output shape:
```json
{"id": 1, "name": "Production DB", "engine": "postgres",
 "tables": [{"id": 5, "name": "orders", "schema": "public", "display_name": "Orders",
   "fields": [{"id": 42, "name": "id", "display_name": "ID",
     "base_type": "type/Integer", "semantic_type": "type/PK"}]}]}
```

Use when you need field-level detail for all tables in one call. Output can be large for big databases -- prefer `get-table` for specific tables.

## get-table

Single table with all fields, types, and foreign keys.

```bash
./metabase-agent get-table 5
```

Output shape:
```json
{"id": 5, "name": "orders", "display_name": "Orders", "schema": "public",
 "db_id": 1, "description": "...",
 "fields": [{"id": 42, "name": "created_at", "display_name": "Created At",
   "base_type": "type/DateTime", "semantic_type": null,
   "fk_target_field_id": null}]}
```

Key field properties:
- `base_type`: `type/Integer`, `type/Text`, `type/DateTime`, `type/Float`, `type/Boolean`
- `semantic_type`: `type/FK` (foreign key), `type/PK` (primary key), `type/Email`, etc.
- `fk_target_field_id`: non-null for foreign keys, points to the target field

This command tells you what field names to use in segments, questions, and dashboard filter targets.

## search

Free-text search across all Metabase content.

```bash
./metabase-agent search "revenue" --models table,card,dashboard
```

`--models` values: `table`, `dashboard`, `card`, `metric`, `segment`

Output shape:
```json
{"results": [{"id": 5, "name": "Revenue Report", "model": "card",
  "description": "...", "database_id": 1, "table_id": 5}],
 "_meta": {"total_count": 3}}
```

Use to find existing content before creating duplicates.

## get-field

Get full field metadata including statistical fingerprint.

```bash
./metabase-agent get-field 42
```

Output shape:
```json
{"id": 42, "name": "total", "display_name": "Total", "table_id": 5,
 "base_type": "type/Float", "semantic_type": null,
 "has_field_values": "none",
 "fingerprint": {
   "distinct_count": 200, "null_percent": 0.0,
   "min": 12.5, "max": 1250.0, "avg": 89.43, "q1": 35.0, "q3": 120.0, "sd": 75.2
 }}
```

Fingerprint content depends on field type:
- **Numbers**: `min`, `max`, `avg`, `q1`, `q3`, `sd` (standard deviation), `distinct_count`, `null_percent`
- **Dates**: `earliest`, `latest`, `distinct_count`, `null_percent`
- **Text**: `average_length`, `distinct_count`, `null_percent`

Use to understand value ranges before building filters (e.g., knowing the min/max of a price field).

## get-field-values

Get distinct values stored in a field. Essential for building correct filters.

```bash
./metabase-agent get-field-values 50
```

Output shape:
```json
{"field_id": 50, "values": ["cancelled", "completed", "pending", "shipped"], "has_more_values": false}
```

Use this to discover valid filter values. For example, before writing `(filter (= (field "ORDERS" "STATUS") "completed"))`, run `get-field-values` on the status field to see all possible values.

Notes:
- Only works for fields with `has_field_values: "list"` (typically low-cardinality fields like status, category, etc.)
- For high-cardinality fields (IDs, timestamps), returns empty values — use `get-field` fingerprint instead for range info
- If a field has remapped display values, returns `[original_value, display_name]` pairs

## ping

Health check. No arguments.

```bash
./metabase-agent ping
```

## Discovery Workflow

```
1. ./metabase-agent list-databases --include tables --fields id,name
   --> Pick database_id, note table names

2. ./metabase-agent get-table <table_id>
   --> Learn field names, types, relationships

3. ./metabase-agent get-field-values <field_id>
   --> Discover valid values for categorical fields (status, type, category)

4. ./metabase-agent get-field <field_id>
   --> Check value ranges for numeric/date fields (min, max, avg, date range)

5. ./metabase-agent search "keyword" --models card,dashboard
   --> Check if the analysis already exists
```

## Gotchas

- `get-database` returns ALL tables. For large databases (100+ tables), use `list-databases --include tables` then `get-table` for specific tables.
- Search results are capped server-side. Use `--models` to narrow results.
- Table IDs, database IDs, and field IDs are stable. You can reference them across commands.
