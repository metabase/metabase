# BigQuery (GoogleSQL) Dialect - Key Differences

BigQuery uses **GoogleSQL**. This guide covers only BigQuery-specific syntax that differs from standard SQL.

## Identifier Quoting

**CRITICAL: BigQuery uses backticks for identifiers, NOT double quotes.**

| Syntax | Meaning |
|--------|---------|
| `` `name` `` | Identifier (column, table) |
| `"text"` | String literal (same as `'text'`) |

```sql
-- CORRECT: backticks for column reference
SELECT `language`, `order` FROM my_table

-- WRONG: double quotes are string literals!
SELECT "language" FROM my_table  -- Returns the STRING "language", not the column
```

Use backticks for: reserved words, special characters, hyphens, project-qualified names (`` `project-id.dataset.table` ``).

## Arrays (0-Indexed!)

BigQuery arrays are **0-indexed**, unlike most SQL dialects.

```sql
-- Array access
SELECT arr[OFFSET(0)] AS first      -- 0-indexed, errors if out of bounds
SELECT arr[SAFE_OFFSET(0)] AS first -- 0-indexed, NULL if out of bounds
SELECT arr[ORDINAL(1)] AS first     -- 1-indexed alternative

-- SPLIT returns array - must use OFFSET to get elements
SELECT SPLIT(csv, ',')[OFFSET(0)] AS first_value

-- Flatten array to rows
SELECT id, element
FROM my_table, UNNEST(array_column) AS element

-- With index
SELECT id, element, idx
FROM my_table, UNNEST(array_column) AS element WITH OFFSET AS idx
```

## Date/Time Type Strictness

BigQuery strictly separates `DATE`, `DATETIME`, `TIMESTAMP`, and `TIME`. Use the matching function prefix.

```sql
-- Use correct function for your type
DATE_TRUNC(date_col, MONTH)           -- For DATE
DATETIME_TRUNC(datetime_col, HOUR)    -- For DATETIME
TIMESTAMP_TRUNC(ts_col, DAY)          -- For TIMESTAMP

DATE_ADD(date_col, INTERVAL 7 DAY)
DATETIME_ADD(dt_col, INTERVAL 2 HOUR)
TIMESTAMP_ADD(ts_col, INTERVAL 30 MINUTE)

DATE_DIFF(end_date, start_date, DAY)
TIMESTAMP_DIFF(end_ts, start_ts, SECOND)
```

**Wrong**: `DATE_TRUNC(timestamp_col, MONTH)` - type mismatch error.

## SAFE Functions

BigQuery provides `SAFE_` variants that return NULL instead of errors:

```sql
SAFE_CAST(value AS INT64)           -- NULL if conversion fails
SAFE_DIVIDE(a, b)                   -- NULL if b is 0
SAFE.JSON_VALUE(json, '$.path')     -- NULL if path missing
arr[SAFE_OFFSET(10)]                -- NULL if out of bounds
```

Prefer `SAFE_CAST` over `CAST` when data quality is uncertain.

## QUALIFY Clause

BigQuery-specific clause to filter on window function results (like HAVING for aggregates):

```sql
-- Get top 1 per category (concise BigQuery idiom)
SELECT *
FROM sales
QUALIFY ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) = 1

-- Without QUALIFY (verbose alternative)
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) AS rn
  FROM sales
) WHERE rn = 1
```

## SELECT EXCEPT / REPLACE

BigQuery-specific modifiers:

```sql
SELECT * EXCEPT(internal_id, debug_col) FROM t
SELECT * REPLACE(ROUND(amount, 2) AS amount) FROM t
SELECT * EXCEPT(tmp) REPLACE(UPPER(name) AS name) FROM t
```

## BigQuery-Specific Aggregations

```sql
COUNTIF(condition)                    -- Count where true
ARRAY_AGG(col ORDER BY x)             -- Aggregate to ordered array
ARRAY_AGG(DISTINCT col IGNORE NULLS)  -- Distinct, no nulls
STRING_AGG(col, ', ' ORDER BY x)      -- Concatenate strings
APPROX_COUNT_DISTINCT(col)            -- Fast approximate distinct count
LOGICAL_AND(bool_col)                 -- TRUE if all TRUE
LOGICAL_OR(bool_col)                  -- TRUE if any TRUE
```

## Structs

```sql
-- Create struct
SELECT STRUCT(id, name, email) AS user_info FROM users

-- Access struct fields
SELECT user_info.name FROM t
```

## JSON

```sql
-- Preferred extraction functions
JSON_VALUE(json_col, '$.field')       -- Returns STRING
JSON_QUERY(json_col, '$.nested')      -- Returns JSON

-- Safe extraction
SAFE.JSON_VALUE(json_col, '$.maybe_missing')

-- Cast result
CAST(JSON_VALUE(json_col, '$.count') AS INT64)
```

## Table Wildcards

Query multiple tables matching a pattern:

```sql
SELECT * FROM `project.dataset.events_*`
WHERE _TABLE_SUFFIX BETWEEN '20240101' AND '20240131'
```
