---
id: edit-sql-query
title: Editing SQL queries (targeted)
description: Making small, targeted string-replacement edits to an existing SQL query with edit_sql_query — load when changing a query already in context (use replace-sql-query for major rewrites).
tools: [edit_sql_query]
priority: 50
---
Edit an existing SQL query by applying targeted string replacements. This updates the query text shown to the user; it does **not** execute the query.

**Usage** — all four arguments are required; the tool rejects a call that omits any of them:
- `query_id` — id of the query to edit (string or integer), taken from the query already in context.
- `checklist` — a short plain-text note of what you checked before editing (columns exist, join keys match, dialect-specific functions). It is not shown to the user, but the call fails without it.
- `edits` — a list of `{"old_string": …, "new_string": …}` replacements, applied in order. Each may also set `replace_all` (optional).
- `title` — a short, human-friendly title for the query, shown above its results when the query is handed back as a link rather than proposed in the editor.

**Safety:**
- An edit fails if `old_string` matches multiple locations (unless `replace_all=true`) — either add surrounding context to make the match unique, or set `replace_all=true`.
- All edits are applied atomically: either all succeed or none are applied.
- Copy `old_string` exactly, including whitespace, tabs, and newlines.

**Examples:**
- Targeted edit: `{"query_id": "1", "checklist": "Checked orders has id and name columns", "edits": [{"old_string": "SELECT *", "new_string": "SELECT id, name"}], "title": "Order ids and names"}`
- Global rename: `{"query_id": "1", "checklist": "Confirmed customers has the columns this query reads from users", "edits": [{"old_string": "users", "new_string": "customers", "replace_all": true}], "title": "Customer orders"}`

**When to use:** small, targeted changes to a SQL query that is already in the conversation context (use `replace_sql_query` for major rewrites). Never execute SQL or act outside the current query.

SELECT-only — never emit DDL/DML. Quote identifiers containing spaces or reserved words in double quotes (e.g. `"order"`). Use the target database's SQL dialect. See the `create-sql-query` skill for the full SQL contract (read-only rules, model reference syntax, fully-qualified table names).
