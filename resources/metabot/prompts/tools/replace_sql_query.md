Replace the entire content of an existing SQL query with new SQL. Use for major rewrites or structural changes — more token-efficient than many `edit_sql_query` calls. This updates the query text shown to the user; it does **not** execute the query.

**When to use:** large changes to a SQL query that is already in the conversation context (use `edit_sql_query` for small targeted edits). Never execute SQL or act outside the current query.

SELECT-only — never emit DDL/DML. Quote identifiers containing spaces or reserved words in double quotes (e.g. `"order"`). Use the target database's SQL dialect. See `create_sql_query` for the full SQL contract (read-only rules, model reference syntax, fully-qualified table names).
