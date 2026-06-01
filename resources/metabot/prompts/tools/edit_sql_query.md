Edit an existing SQL query by applying targeted string replacements. This updates the query text shown to the user; it does **not** execute the query.

**Safety:**
- An edit fails if `old_string` matches multiple locations (unless `replace_all=true`) — either add surrounding context to make the match unique, or set `replace_all=true`.
- All edits are applied atomically: either all succeed or none are applied.
- Copy `old_string` exactly, including whitespace, tabs, and newlines.

After the edit succeeds, Metabase executes the updated query and includes a `<query_execution>` block in the tool result. Use those rows and columns to verify the edit and summarize the actual data. When `<query_execution>` is marked `sampled="true"`, it is a representative sample of the query's own rows (minimum, maximum, outliers, and evenly spaced trend points) — every sampled row is a real point on the chart the user sees, so you may cite the sampled values, including the minimum and maximum. Only run a follow-up query when you need an exact count, ranking, or aggregate the sample cannot give; do it without asking permission first and do not produce a final answer until it returns.
The `<query_execution>` block may include result values linked with `metabase://data-point` URLs. Whenever you mention a specific value from the updated query or chart, use the matching URL and choose natural link text for your answer.

**Examples:**
- Targeted edit: `{"edits": [{"old_string": "SELECT *", "new_string": "SELECT id, name"}]}`
- Global rename: `{"edits": [{"old_string": "users", "new_string": "customers", "replace_all": true}]}`

**When to use:** small, targeted changes to a SQL query that is already in the conversation context (use `replace_sql_query` for major rewrites). Never execute SQL or act outside the current query.

SELECT-only — never emit DDL/DML. Quote identifiers containing spaces or reserved words in double quotes (e.g. `"order"`). Use the target database's SQL dialect. See `create_sql_query` for the full SQL contract (read-only rules, model reference syntax, fully-qualified table names).
