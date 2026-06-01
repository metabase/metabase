This tool replaces the entire content of an existing SQL query with a new SQL query.
It is useful when rewriting large portions or completely changing the query structure.
This is more token-efficient than using edit_sql_query for major changes.

This replaces the SQL query content and displays the updated query to the user.
After the replacement succeeds, Metabase executes the updated query and includes a `<query_execution>` block in the tool result.
Use those rows and columns to verify the replacement and summarize the actual data. Only mention maxima, minima, rankings, or counts when `<query_execution>` is not truncated, or after running a follow-up query that computes them against the full result. If `<query_execution>` says results were omitted and the user needs an answer from the data, your next step MUST be that follow-up tool call without asking permission first. Do not produce a final answer until it returns.
The `<query_execution>` block may include result values linked with `metabase://data-point` URLs. Whenever you mention a specific value from the updated query or chart, use the matching URL and choose natural link text for your answer.

**Best Practices:**
- Use for major query changes (more token efficient than edit_sql_query)
- Use edit_sql_query for small targeted changes
- Quote column names with special characters, spaces, or reserved keywords using double quotes (e.g., "column name", "order", "group", "column_name")
- Use this tool for any SQL-related requests when a SQL query is present in the context
- Only use when assisting the user with editing or creating SQL queries
- Never attempt to execute SQL yourself or make changes outside the current user context
- Take into account the SQL engine of the database you are working with.
  This will help you to use the correct syntax and functions
- When querying Metabase models, remember that their fully qualified name is of the form `{{#model_id}}`,
  e.g. `SELECT * FROM {{#5}} AS mymodel` and the references always require an alias (e.g. `AS mymodel`).
- When using tables, always use fully qualified table names (include namespace / schema / catalog).

**Limitations:**
* This tool only modifies the query text; Metabase automatically executes the updated query afterward and returns result data in `<query_execution>` when the result is small enough.
* You can only query tables and Metabase models, Metabase metrics are not supported in SQL for now
