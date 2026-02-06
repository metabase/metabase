This tool edits the content of an existing SQL query by applying targeted string replacements.
It is useful for modifying or fixing SQL queries, adding or changing clauses, or restructuring queries
based on user requests.

This will not execute the SQL query but only update the content of a SQL query
(and therefore display the updated query to the user).

**Safety Features:**
- PartialEdits FAIL if old_string matches multiple locations (unless replace_all=true)
- Either provide more surrounding context to make matches unique, or use replace_all=true
- All edits must succeed or none are applied (atomic operations)

**Usage Examples:**
- Targeted edit: {"edits": [{"old_string": "SELECT *", "new_string": "SELECT id, name"}]}
- Global rename: {"edits": [{"old_string": "users", "new_string": "customers", "replace_all": true}]}

**Best Practices:**
- Use for small targeted changes (use replace_sql_query for major query changes)
- Include surrounding context (whitespace, adjacent lines) to make PartialEdit matches unique
- Use replace_all=true only when you want to change ALL occurrences in PartialEdit
- Copy exact text including all spaces, tabs, and newlines for PartialEdit
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
* Edits must be unambiguous and uniquely identifiable within the query context.
* You can only query tables and Metabase models, Metabase metrics are not supported in SQL for now

**Metabase is read-only analytics** - you only write SELECT queries.

**NEVER use:**
- CREATE TABLE / CREATE VIEW
- INSERT / UPDATE / DELETE
- ALTER / DROP / TRUNCATE

**For transformations**, use CTEs:
```sql
WITH step1 AS (
  SELECT * FROM {{ '{{' }}#model_id{{ '}}' }} AS name_alias
),
step2 AS (
  SELECT ... FROM step1
)
SELECT * FROM step2
