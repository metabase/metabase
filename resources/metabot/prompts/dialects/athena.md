# Athena (Trino/Presto) SQL Dialect Instructions

Athena uses **Trino** (formerly PrestoSQL) as its query engine. Follow these dialect-specific rules when generating SQL.

## Identifier Quoting

- Use **double quotes** for identifiers containing special characters or reserved words: `"my-column"`, `"order"`
- Identifiers are **case-insensitive** (stored as lowercase internally)
- Avoid quoting unless necessary; prefer snake_case column names

## String Operations

```sql
-- Concatenation: use || operator (NOT CONCAT for multiple args)
SELECT first_name || ' ' || last_name AS full_name

-- String functions
SELECT
  LOWER(name),
  UPPER(name),
  TRIM(name),
  SUBSTR(name, 1, 3),          -- 1-indexed
  LENGTH(name),
  REPLACE(name, 'old', 'new'),
  SPLIT(csv_column, ','),       -- Returns ARRAY
  SPLIT_PART(csv_column, ',', 1) -- Returns single element (1-indexed)
```

## Date and Time

```sql
-- Current date/time
SELECT
  CURRENT_DATE,
  CURRENT_TIMESTAMP,
  NOW()                          -- Alias for CURRENT_TIMESTAMP

-- Date truncation (returns DATE or TIMESTAMP)
SELECT DATE_TRUNC('month', order_date)   -- 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second'

-- Date arithmetic
SELECT
  DATE_ADD('day', 7, order_date),        -- Add interval
  DATE_ADD('month', -1, order_date),     -- Subtract interval
  DATE_DIFF('day', start_date, end_date) -- Returns INTEGER difference

-- Extraction
SELECT
  YEAR(order_date),
  MONTH(order_date),
  DAY(order_date),
  DAY_OF_WEEK(order_date),       -- 1=Monday, 7=Sunday
  EXTRACT(HOUR FROM timestamp_col)

-- Formatting and parsing
SELECT
  FORMAT_DATETIME(timestamp_col, 'yyyy-MM-dd'),
  DATE_PARSE(string_col, '%Y-%m-%d')     -- Parse string to timestamp
```

**Important**: `DATE_TRUNC` returns the same type as input. For DATE columns, it returns DATE; for TIMESTAMP, it returns TIMESTAMP.

## Type Casting

```sql
-- Standard CAST (throws error on failure)
SELECT CAST(string_col AS BIGINT)
SELECT CAST(string_col AS DOUBLE)
SELECT CAST(string_col AS DATE)
SELECT CAST(timestamp_col AS VARCHAR)

-- TRY_CAST (returns NULL on failure - preferred for data quality issues)
SELECT TRY_CAST(potentially_bad_data AS INTEGER)

-- Common type names: VARCHAR, BIGINT, INTEGER, DOUBLE, DECIMAL(p,s), BOOLEAN, DATE, TIMESTAMP, ARRAY, MAP
```

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),           -- First non-null value
  NULLIF(col, ''),                             -- Returns NULL if col = ''
  IF(condition, true_value, false_value),      -- Ternary expression
  CASE WHEN col IS NULL THEN 'N/A' ELSE col END
```

**Note**: Athena does NOT support `IFNULL()` or `NVL()` — use `COALESCE` instead.

## Boolean Logic

```sql
-- Boolean expressions
SELECT * FROM t WHERE flag = TRUE
SELECT * FROM t WHERE flag IS TRUE      -- Handles NULL correctly
SELECT * FROM t WHERE flag IS NOT FALSE -- TRUE or NULL

-- IF function returns values, not boolean
SELECT IF(amount > 100, 'high', 'low') AS tier
```

## Arrays and Complex Types

```sql
-- Array literal
SELECT ARRAY[1, 2, 3]

-- Array access (1-indexed)
SELECT my_array[1] AS first_element

-- Array functions
SELECT
  CARDINALITY(my_array),           -- Length
  CONTAINS(my_array, 'value'),     -- Boolean membership test
  ARRAY_JOIN(my_array, ', '),      -- Join to string
  ARRAY_DISTINCT(my_array),        -- Remove duplicates
  ARRAY_SORT(my_array),
  SLICE(my_array, 1, 3),           -- Subarray (start, length)
  CONCAT(array1, array2)           -- Concatenate arrays

-- UNNEST: flatten array to rows (CRITICAL for array columns)
SELECT t.id, u.element
FROM my_table t
CROSS JOIN UNNEST(t.array_column) AS u(element)

-- UNNEST with ordinality (get index)
SELECT t.id, u.element, u.idx
FROM my_table t
CROSS JOIN UNNEST(t.array_column) WITH ORDINALITY AS u(element, idx)
```

## Maps

```sql
-- Map literal
SELECT MAP(ARRAY['a', 'b'], ARRAY[1, 2])

-- Map access
SELECT my_map['key']

-- Map functions
SELECT
  MAP_KEYS(my_map),
  MAP_VALUES(my_map),
  ELEMENT_AT(my_map, 'key'),       -- NULL-safe access
  CARDINALITY(my_map)              -- Number of entries
```

## JSON Handling

```sql
-- Parse JSON string
SELECT JSON_PARSE(json_string_col)

-- Extract from JSON (returns JSON type)
SELECT JSON_EXTRACT(json_col, '$.field')
SELECT JSON_EXTRACT(json_col, '$.nested.field')
SELECT JSON_EXTRACT(json_col, '$.array[0]')

-- Extract as scalar (returns VARCHAR)
SELECT JSON_EXTRACT_SCALAR(json_col, '$.field')

-- Cast JSON to SQL types
SELECT CAST(JSON_EXTRACT(json_col, '$.count') AS INTEGER)
```

## Window Functions

```sql
SELECT
  *,
  ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) AS rn,
  RANK() OVER (PARTITION BY category ORDER BY amount DESC) AS rnk,
  SUM(amount) OVER (PARTITION BY category) AS category_total,
  LAG(amount, 1) OVER (ORDER BY order_date) AS prev_amount,
  LEAD(amount, 1) OVER (ORDER BY order_date) AS next_amount,
  FIRST_VALUE(amount) OVER (PARTITION BY category ORDER BY order_date) AS first_in_category,
  SUM(amount) OVER (ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
```

## Common Table Expressions (CTEs)

```sql
WITH
  cte1 AS (
    SELECT * FROM table1 WHERE condition
  ),
  cte2 AS (
    SELECT * FROM cte1 JOIN table2 USING (id)
  )
SELECT * FROM cte2
```

CTEs improve readability and allow query reuse. Athena optimizes CTE execution.

## Aggregation

```sql
SELECT
  COUNT(*),
  COUNT(DISTINCT col),
  SUM(amount),
  AVG(amount),
  MIN(val), MAX(val),
  ARRAY_AGG(col),                  -- Aggregate into array
  ARRAY_AGG(DISTINCT col),
  MAP_AGG(key_col, value_col),     -- Aggregate into map
  APPROX_DISTINCT(col),            -- Fast approximate count distinct
  APPROX_PERCENTILE(col, 0.5)      -- Approximate median
FROM t
GROUP BY category
```

**Performance tip**: Use `APPROX_DISTINCT` instead of `COUNT(DISTINCT)` for large datasets when approximate results are acceptable.

## LIMIT and Pagination

```sql
-- Basic limit
SELECT * FROM t LIMIT 100

-- Offset (use with caution - inefficient for large offsets)
SELECT * FROM t ORDER BY id LIMIT 100 OFFSET 200
```

## Subqueries

```sql
-- Scalar subquery
SELECT *, (SELECT MAX(val) FROM other) AS max_val FROM t

-- IN subquery
SELECT * FROM t WHERE id IN (SELECT id FROM other WHERE condition)

-- EXISTS
SELECT * FROM t WHERE EXISTS (SELECT 1 FROM other WHERE other.t_id = t.id)

-- Correlated subquery in SELECT (use sparingly)
SELECT
  t.*,
  (SELECT COUNT(*) FROM orders o WHERE o.customer_id = t.id) AS order_count
FROM customers t
```

## JOINs

```sql
-- Standard joins
SELECT * FROM a INNER JOIN b ON a.id = b.a_id
SELECT * FROM a LEFT JOIN b ON a.id = b.a_id
SELECT * FROM a RIGHT JOIN b ON a.id = b.a_id
SELECT * FROM a FULL OUTER JOIN b ON a.id = b.a_id
SELECT * FROM a CROSS JOIN b

-- USING shorthand (when column names match)
SELECT * FROM a JOIN b USING (id)
```

## UNION Operations

```sql
-- Remove duplicates
SELECT col FROM t1 UNION SELECT col FROM t2

-- Keep all rows (faster)
SELECT col FROM t1 UNION ALL SELECT col FROM t2

-- Intersection and difference
SELECT col FROM t1 INTERSECT SELECT col FROM t2
SELECT col FROM t1 EXCEPT SELECT col FROM t2
```

## Performance Considerations

### Partition Pruning
Always filter on partition columns when available:
```sql
-- Good: filters on partition
SELECT * FROM events WHERE dt = '2024-01-15' AND user_id = 123

-- Bad: scans all partitions
SELECT * FROM events WHERE user_id = 123
```

### Predicate Pushdown
Put simple equality filters early:
```sql
-- Filters pushed down to storage
SELECT * FROM t WHERE status = 'active' AND region = 'us-west-2'
```

### Column Pruning
Select only needed columns (especially important for columnar formats):
```sql
-- Good
SELECT id, name, amount FROM large_table

-- Bad
SELECT * FROM large_table
```

## Athena-Specific Limitations

1. **No UPDATE/DELETE**: Athena is read-only for standard tables (INSERT only via CTAS/INSERT INTO)
2. **No transactions**: Each query is atomic but there's no multi-statement transaction support
3. **Query timeout**: 30-minute default limit
4. **Result size**: 2GB uncompressed result limit
5. **No stored procedures or functions**
6. **Case-insensitive identifiers**: Column `Name` and `name` are the same

## Common Patterns

### Safe Division (avoid divide by zero)
```sql
SELECT
  numerator / NULLIF(denominator, 0) AS ratio,
  IF(denominator = 0, 0, numerator / denominator) AS ratio_with_default
```

### Conditional Aggregation
```sql
SELECT
  COUNT(*) AS total,
  COUNT(IF(status = 'active', 1, NULL)) AS active_count,
  SUM(IF(type = 'revenue', amount, 0)) AS revenue
FROM t
```

### Date Series Generation (via UNNEST)
```sql
SELECT dt
FROM UNNEST(SEQUENCE(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1' DAY)) AS t(dt)
```

### Pivoting Data
```sql
SELECT
  category,
  SUM(IF(year = 2023, amount, 0)) AS "2023",
  SUM(IF(year = 2024, amount, 0)) AS "2024"
FROM sales
GROUP BY category
```
