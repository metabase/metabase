---
id: replace-sql-query
title: Replacing SQL queries (full rewrite)
description: Replacing the entire body of an existing SQL query with replace_sql_query — load for major rewrites or structural changes (use edit-sql-query for small targeted edits).
tools: [replace_sql_query]
priority: 50
---
Replace the entire content of an existing SQL query with new SQL. Use for major rewrites or structural changes — more token-efficient than many `edit_sql_query` calls. This updates the query text shown to the user; it does **not** execute the query.

**When to use:** large changes to a SQL query that is already in the conversation context (use `edit_sql_query` for small targeted edits). Never execute SQL or act outside the current query.

SELECT-only — never emit DDL/DML. Quote identifiers containing spaces or reserved words in double quotes (e.g. `"order"`). Use the target database's SQL dialect. See the `create-sql-query` skill for the full SQL contract (read-only rules, model reference syntax, fully-qualified table names).
