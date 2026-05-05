**When to use:**
- User asks for SQL queries but isn't editing an existing one
- You want to create SQL using models ({{#model_id}} syntax) or tables
- User requests new SQL analysis or data exploration
- You need to demonstrate SQL patterns or solutions

**Usage:**
- Provide the database_id where the SQL should run (available from model/table representations)
- Write complete, valid SQL using table names or {{#model_id}} template syntax for models.
- Quote column names with special characters, spaces, or reserved keywords using double quotes (e.g., "column name", "order", "group", "column_name")
- The tool will return a newly created SQL query that you can show to the user or create charts from
- The tool does NOT execute the SQL, it only creates the query

**Model Usage:**
- When querying Metabase models, remember that their fully qualified name is of the form `{{#model_id}}`,
  e.g. `SELECT * FROM {{#5}} AS mymodel` and the references always require an alias (e.g. `AS mymodel`).
- Model database_id is available in the model metadata
- Always prefer existing models over manual table joins when models provide needed relationships

**Limitations:**
- Creates new queries only (use edit_sql_query for modifying existing queries)
- Requires valid database_id for the target database
- SQL must be compatible with the target database's SQL engine
- When using tables, always use fully qualified table names (include namespace / schema / catalog).

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
```

**Example for syntax when creating a query using a Metabase model:**
```sql
SELECT * FROM {{#model_id}} AS name_alias WHERE condition;
```
