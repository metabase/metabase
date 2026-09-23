---
id: megabot-discovery
title: Finding warehouse tables and columns
description: How to find the tables and columns a warehouse query needs when they aren't already listed in your prompt.
tools: [run_warehouse_query, query_app_db]
---
## Finding warehouse tables and columns

The warehouse databases this user can query are listed under "This instance" in your system prompt, with their
numeric ids and their most-viewed tables. On a small instance their columns are listed too, as `name #<field id>`.
Before you rebuild a calculation, check the metrics and models listed there.

When a table or its columns aren't listed, read them from the app db with `query_app_db`. Apply the data-model
edits admins made, which live in the `*_user_settings` tables:

- Tables: `SELECT t.id, t.schema, t.name, COALESCE(s.display_name, t.display_name) AS display_name FROM metabase_table t LEFT JOIN metabase_table_user_settings s ON s.table_id = t.id WHERE t.db_id = <id> AND t.active = true`.
  Narrow it with `AND t.name LIKE '%order%'`.
- Columns: `SELECT f.id, f.name, f.base_type, CASE WHEN s.semantic_type_set THEN s.semantic_type ELSE f.semantic_type END AS semantic_type, CASE WHEN s.fk_target_field_id_set THEN s.fk_target_field_id ELSE f.fk_target_field_id END AS fk_target_field_id FROM metabase_field f LEFT JOIN metabase_field_user_settings s ON s.field_id = f.id WHERE f.table_id = <id> AND f.active = true`.
- A column's categories: `SELECT * FROM metabase_fieldvalues WHERE field_id = <id> AND type = 'full'`.

Structured queries take the numeric table and field ids (`t.id`, `f.id`); SQL takes the physical `schema` and
`name`. `fk_target_field_id` shows you how tables join. `metabase_field` describes warehouse columns: for the app db's own columns, use `describe_app_db`.
