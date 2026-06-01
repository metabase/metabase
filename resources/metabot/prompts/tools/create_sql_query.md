**When to use:**
- User asks for SQL queries but isn't editing an existing one
- You want to create SQL using models ({{#model_id}} syntax) or tables
- User requests new SQL analysis or data exploration
- You need to demonstrate SQL patterns or solutions

**Usage:**
- Provide the database_id where the SQL should run (available from model/table representations)
- Write complete, valid SQL using table names or {{#model_id}} template syntax for models.
- Quote column names with special characters, spaces, or reserved keywords using double quotes (e.g., "column name", "order", "group", "column_name")
- The tool returns a newly created SQL query that you can show to the user or create charts from.
- After the query is created, Metabase executes it and includes a `<query_execution>` block in the tool result. Use those rows and columns to summarize the actual data.
- The `<query_execution>` block may include result values linked with `metabase://data-point` URLs. Whenever you mention a specific value from the generated query or chart, use the matching URL and choose natural link text for your answer.
- When the query execution succeeds, proactively mention one concrete observation from the data, such as a trend, outlier, or notable category. When a query groups by a column that returns many categories, do not stop at the top few — also tell the user how concentrated the metric is and how much of the total falls outside the items you name (and on which measure), so your summary reflects the whole result and not just the head; otherwise it will diverge from a chart that groups the tail into a single "Other" bucket. When `<query_execution>` is marked `sampled="true"`, it is a representative sample of the query's own rows (minimum, maximum, outliers, and evenly spaced trend points) — every sampled row is a real point on the chart the user sees, so you may cite the sampled values, including the minimum and maximum. Only run a follow-up query when you need an exact count, ranking, or aggregate the sample cannot give; do it without asking permission first and do not produce a final answer until it returns. Do not just say that the query was created.

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
