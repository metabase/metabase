---
id: replace-sql-query
title: Replacing SQL queries (full rewrite)
description: Replacing the entire body of an existing SQL query with replace_sql_query — load for major rewrites or structural changes (use edit-sql-query for small targeted edits).
tools: [replace_sql_query]
priority: 50
---
Replace the entire content of an existing SQL query with new SQL. Use for major rewrites or structural changes — more token-efficient than many `edit_sql_query` calls. This updates the query text shown to the user; it does **not** execute the query.

**Usage** — all four arguments are required; the tool rejects a call that omits any of them:
- `query_id` — id of the query to replace (string or integer), taken from the query already in context.
- `checklist` — a short plain-text note of what you checked before rewriting (columns exist, join keys match, dialect-specific functions). It is not shown to the user, but the call fails without it.
- `new_query` — the complete replacement SQL. It replaces the whole body, so include everything the query needs.
- `title` — a short, human-friendly title for the query, shown above its results when the query is handed back as a link rather than proposed in the editor.

**Example:** `{"query_id": "1", "checklist": "Re-read orders and customers; join is on customer_id", "new_query": "SELECT c.name, COUNT(*) AS order_count FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name", "title": "Orders per customer"}`

**When to use:** large changes to a SQL query that is already in the conversation context (use `edit_sql_query` for small targeted edits). Never execute SQL or act outside the current query.

SELECT-only — never emit DDL/DML. Quote identifiers containing spaces or reserved words in double quotes (e.g. `"order"`). Use the target database's SQL dialect. See the `create-sql-query` skill for the full SQL contract (read-only rules, model reference syntax, fully-qualified table names).
