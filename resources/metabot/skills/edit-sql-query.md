---
id: edit-sql-query
title: Editing SQL queries (targeted)
description: Making small, targeted string-replacement edits to an existing SQL query with edit_sql_query — load when changing a query already in context (use replace-sql-query for major rewrites).
tools: [edit_sql_query]
priority: 50
---
Edit an existing SQL query by applying targeted string replacements. This updates the query text shown to the user; it does **not** execute the query.

**Safety:**
- An edit fails if `old_string` matches multiple locations (unless `replace_all=true`) — either add surrounding context to make the match unique, or set `replace_all=true`.
- All edits are applied atomically: either all succeed or none are applied.
- Copy `old_string` exactly, including whitespace, tabs, and newlines.

**Examples:**
- Targeted edit: `{"edits": [{"old_string": "SELECT *", "new_string": "SELECT id, name"}]}`
- Global rename: `{"edits": [{"old_string": "users", "new_string": "customers", "replace_all": true}]}`

**When to use:** small, targeted changes to a SQL query that is already in the conversation context (use `replace_sql_query` for major rewrites). Never execute SQL or act outside the current query.

SELECT-only — never emit DDL/DML. Quote identifiers containing spaces or reserved words in double quotes (e.g. `"order"`). Use the target database's SQL dialect. See the `create-sql-query` skill for the full SQL contract (read-only rules, model reference syntax, fully-qualified table names).
