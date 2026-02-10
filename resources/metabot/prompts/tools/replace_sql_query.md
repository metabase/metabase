# Tool: `replace_sql_query`

This tool replaces the entire content of an existing SQL query with a new SQL query.
It is useful when rewriting large portions or completely changing the query structure.
This is more token-efficient than using edit_sql_query for major changes.

This will not execute the SQL query but only update the content of a SQL query
(and therefore display the updated query to the user).

**Best Practices:**
- Use for major query changes (more token efficient than edit_sql_query)
- Use edit_sql_query for small targeted changes
- Quote column names with special characters, spaces, or reserved keywords using double quotes (e.g., "column name", "order", "group", "column_name")
- Use this tool for any SQL-related requests when a SQL query is present in the context
- Only use when assisting the user with editing or creating SQL queries
- Never attempt to execute SQL or make changes outside the current user context
- Take into account the SQL engine of the database you are working with.
  This will help you to use the correct syntax and functions
- When querying Metabase models, remember that their fully qualified name is of the form `{{#model_id}}`,
  e.g. `SELECT * FROM {{#5}} AS mymodel` and the references always require an alias (e.g. `AS mymodel`).

**Limitations:**
* This tool does not execute SQL queries, it only modifies the query text.
* You can only query tables and Metabase models, Metabase metrics are not supported in SQL for now
