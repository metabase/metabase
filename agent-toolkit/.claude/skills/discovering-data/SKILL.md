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

3. ./metabase-agent search "keyword" --models card,dashboard
   --> Check if the analysis already exists
```

## Gotchas

- `get-database` returns ALL tables. For large databases (100+ tables), use `list-databases --include tables` then `get-table` for specific tables.
- Search results are capped server-side. Use `--models` to narrow results.
- Table IDs, database IDs, and field IDs are stable. You can reference them across commands.
