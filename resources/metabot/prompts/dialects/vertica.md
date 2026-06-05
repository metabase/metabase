# Vertica SQL Dialect Instructions

Vertica is a columnar analytics database derived from PostgreSQL. Follow these dialect-specific rules.

## Identifier Quoting

- Use **double quotes** for identifiers: `"MyColumn"`, `"table-name"`
- Unquoted identifiers are **lowercased**: `SELECT MyColumn` becomes `mycolumn`
- String literals use **single quotes**: `'string value'`

```sql
SELECT "CamelCaseColumn", "reserved-word" FROM "My Table"
```

## String Operations

```sql
-- Concatenation: || operator (preferred)
SELECT first_name || ' ' || last_name AS full_name

-- String functions
SELECT
  LOWER(name), UPPER(name), INITCAP(name),
  TRIM(name), LTRIM(name), RTRIM(name),
  SUBSTR(name, 1, 3),                   -- 1-indexed (or SUBSTRING)
  LENGTH(name), CHAR_LENGTH(name),
  REPLACE(name, 'old', 'new'),
  POSITION('sub' IN name),              -- Find position
  INSTR(name, 'sub'),                   -- Alternative
  LEFT(name, 3), RIGHT(name, 3),
  LPAD(str, 10, '0'), RPAD(str, 10, ' '),
  REPEAT(str, 3),
  REVERSE(name),
  SPLIT_PART(csv, ',', 1),              -- Extract nth element (1-indexed)
  REGEXP_REPLACE(text, 'pattern', 'replacement'),
  REGEXP_SUBSTR(text, 'pattern')

-- Pattern matching
SELECT * FROM t WHERE name LIKE 'A%'            -- Case-sensitive
SELECT * FROM t WHERE name ILIKE 'a%'           -- Case-insensitive (Vertica supports!)
SELECT * FROM t WHERE name REGEXP 'pattern'
SELECT * FROM t WHERE REGEXP_LIKE(name, '^[A-Z]')
```

## Date and Time

```sql
-- Current date/time
SELECT
  CURRENT_DATE,                         -- DATE
  CURRENT_TIMESTAMP,                    -- TIMESTAMP WITH TIME ZONE
  NOW(),                                -- Same as CURRENT_TIMESTAMP
  GETDATE(),                            -- Alias for SYSDATE
  LOCALTIME, LOCALTIMESTAMP             -- Without timezone

-- Date truncation
SELECT DATE_TRUNC('month', order_date)          -- year, quarter, month, week, day, hour, minute, second
SELECT DATE_TRUNC('week', order_date)           -- Truncates to Monday
SELECT TRUNC(order_date, 'MM')                  -- Oracle-style alternative

-- Date arithmetic
SELECT
  order_date + INTERVAL '7 days',
  order_date - INTERVAL '1 month',
  order_date + 7,                               -- Add integer days
  TIMESTAMPADD(MONTH, 1, order_date),           -- Alternative
  ADD_MONTHS(order_date, 3)                     -- Oracle-compatible

-- Date difference
SELECT
  DATEDIFF('day', start_date, end_date),        -- Integer difference
  DATEDIFF('month', start_date, end_date),
  TIMESTAMPDIFF(HOUR, start_ts, end_ts),
  end_date - start_date                         -- Returns INTERVAL

-- Extraction
SELECT
  YEAR(order_date), MONTH(order_date), DAY(order_date),
  EXTRACT(YEAR FROM order_date),
  EXTRACT(MONTH FROM order_date),
  EXTRACT(DOW FROM order_date),                 -- 0=Sunday, 6=Saturday
  DAYOFWEEK(order_date),                        -- 1=Sunday, 7=Saturday
  DAYOFYEAR(order_date),
  HOUR(ts), MINUTE(ts), SECOND(ts),
  QUARTER(order_date), WEEK(order_date)

-- Formatting and parsing
SELECT
  TO_CHAR(order_date, 'YYYY-MM-DD'),
  TO_CHAR(order_date, 'Mon DD, YYYY'),
  TO_CHAR(amount, '999,999.00'),
  TO_DATE('2024-01-15', 'YYYY-MM-DD'),
  TO_TIMESTAMP('2024-01-15 10:30:00', 'YYYY-MM-DD HH24:MI:SS')
```

## Type Casting

```sql
-- PostgreSQL shorthand (supported)
SELECT '123'::INT, '2024-01-15'::DATE, 123::VARCHAR

-- Standard CAST
SELECT CAST('123' AS INTEGER)
SELECT CAST('123.45' AS NUMERIC(10,2))
SELECT CAST(order_date AS VARCHAR)

-- Type names: INTEGER, INT, BIGINT, SMALLINT, NUMERIC(p,s), DECIMAL(p,s),
--             FLOAT, DOUBLE PRECISION, REAL, BOOLEAN,
--             VARCHAR(n), CHAR(n), LONG VARCHAR,
--             DATE, TIME, TIMESTAMP, TIMESTAMPTZ, INTERVAL,
--             BINARY, VARBINARY, LONG VARBINARY, UUID
```

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),    -- First non-null
  NVL(nullable_col, 'default'),         -- Oracle-compatible
  NVL2(col, 'not_null', 'is_null'),     -- Oracle-compatible
  NULLIF(col, ''),                      -- Returns NULL if col = ''
  IFNULL(col, 'default'),               -- MySQL-compatible
  ZEROIFNULL(num_col),                  -- Returns 0 if NULL (Vertica-specific)
  NULLIFZERO(num_col)                   -- Returns NULL if 0 (Vertica-specific)
```

## Arrays

```sql
-- Array literal
SELECT ARRAY[1, 2, 3]

-- Array access (0-indexed!)
SELECT my_array[0] AS first_element

-- Array functions
SELECT
  ARRAY_LENGTH(arr, 1),                 -- Length of first dimension
  ARRAY_CAT(arr1, arr2),                -- Concatenate
  ARRAY_CONTAINS(arr, value),           -- Membership test (returns boolean)
  ARRAY_FIND(arr, value),               -- Index of value (-1 if not found)
  STRING_TO_ARRAY(csv, ','),            -- Split string to array
  ARRAY_TO_STRING(arr, ', ')            -- Join array to string

-- EXPLODE: flatten array to rows
SELECT t.id, elem
FROM t, EXPLODE(t.arr) AS elem
```

**Note**: Vertica arrays are **0-indexed**, unlike PostgreSQL's 1-indexed arrays.

## Analytic (Window) Functions

```sql
SELECT
  ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC),
  RANK() OVER (ORDER BY amt DESC),
  DENSE_RANK() OVER (ORDER BY amt DESC),
  SUM(amt) OVER (PARTITION BY cat),
  LAG(amt, 1, 0) OVER (ORDER BY dt),
  LEAD(amt) OVER (ORDER BY dt),
  FIRST_VALUE(amt) OVER w,
  LAST_VALUE(amt) OVER w,
  NTH_VALUE(amt, 2) OVER w,
  NTILE(4) OVER (ORDER BY amt),
  PERCENT_RANK() OVER (ORDER BY amt),
  CUME_DIST() OVER (ORDER BY amt),
  RATIO_TO_REPORT(amt) OVER (PARTITION BY cat),         -- Percentage of group total
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amt)      -- Median
      OVER (PARTITION BY cat)
FROM t
WINDOW w AS (PARTITION BY cat ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
```

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amount), AVG(amount),
  MIN(val), MAX(val),
  LISTAGG(col, ', '),                           -- String aggregation (no ORDER BY in older versions)
  GROUP_CONCAT(col),                            -- Alternative
  APPROXIMATE_COUNT_DISTINCT(col),              -- HyperLogLog approximation
  APPROXIMATE_PERCENTILE(amount USING PARAMETERS percentile = 0.5),
  STDDEV(amount), VARIANCE(amount),
  BOOL_AND(flag), BOOL_OR(flag)
FROM t
GROUP BY category
```

## Common Table Expressions

```sql
-- Standard CTE
WITH active_users AS (
  SELECT * FROM users WHERE status = 'active'
)
SELECT * FROM active_users

-- Recursive CTE
WITH RECURSIVE subordinates AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id, s.depth + 1
  FROM employees e JOIN subordinates s ON e.manager_id = s.id
)
SELECT * FROM subordinates
```

## LIMIT and Pagination

```sql
SELECT * FROM t LIMIT 10
SELECT * FROM t LIMIT 10 OFFSET 20
SELECT * FROM t ORDER BY col LIMIT 10           -- LIMIT at end
```

## MERGE (Upsert)

```sql
MERGE INTO target_table t
USING source_table s ON t.id = s.id
WHEN MATCHED THEN
  UPDATE SET name = s.name, updated_at = NOW()
WHEN NOT MATCHED THEN
  INSERT (id, name, created_at) VALUES (s.id, s.name, NOW())
```

## Vertica-Specific Features

### TIMESERIES Clause (Gap Filling)

```sql
-- Fill missing time intervals with interpolation
SELECT
  slice_time,
  TS_FIRST_VALUE(value) AS first_val,
  TS_LAST_VALUE(value) AS last_val,
  TIME_SLICE(ts, 1, 'HOUR') AS hour_slice
FROM metrics
TIMESERIES slice_time AS '1 hour' OVER (PARTITION BY device_id ORDER BY ts)
```

### INTERPOLATE

```sql
-- Linear interpolation across time gaps
SELECT time_col, INTERPOLATE(value, time_col USING LINEAR) AS interpolated
FROM metrics
GROUP BY time_col
```

### Pattern Matching (MATCH clause)

```sql
SELECT *
FROM events
MATCH (PARTITION BY session_id ORDER BY event_time
  DEFINE page_view AS event_type = 'page_view',
         purchase AS event_type = 'purchase'
  PATTERN P AS (page_view+ purchase)
  ROWS MATCH FIRST EVENT)
```

### COPY (Bulk Load)

```sql
-- Fast bulk load from files
COPY t FROM '/path/to/data.csv' DELIMITER ',' ENCLOSED BY '"' SKIP 1
COPY t FROM STDIN DELIMITER '|'
```

### Projection Hints

```sql
-- Hint to use specific projection
SELECT /*+ PROJS(t, projection_name) */ * FROM t

-- Explain projection usage
EXPLAIN SELECT * FROM t
```

## Common Patterns

### Safe Division
```sql
SELECT
  NULLIF(denominator, 0),
  numerator / NULLIF(denominator, 0),
  ZEROIFNULL(numerator) / NULLIFZERO(denominator)
```

### Conditional Aggregation
```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
  COUNT(CASE WHEN region = 'US' THEN 1 END) AS us_count
FROM t
```

### First Row Per Group
```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY updated_at DESC) AS rn
  FROM products
) t WHERE rn = 1
```

### Date Series Generation
```sql
WITH RECURSIVE dates AS (
  SELECT DATE '2024-01-01' AS dt
  UNION ALL
  SELECT dt + 1 FROM dates WHERE dt < DATE '2024-12-31'
)
SELECT * FROM dates
```

### Semi-Join with EXISTS
```sql
SELECT * FROM orders o
WHERE EXISTS (
  SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.region = 'US'
)
```

## Performance Considerations

- **Projections**: Vertica stores data in projections (pre-sorted, pre-aggregated). Query planner selects optimal projection.
- **Segmentation**: Data distributed across nodes by segmentation key. Include segmentation columns in JOINs and WHERE clauses.
- **Sort order**: Projections are sorted. Queries that match sort order are faster.
- **ANALYZE_STATISTICS**: Run after bulk loads for optimal query plans.
- **DELETE vs. PURGE**: DELETE marks rows; use PURGE or MAKE_AHM_NOW() + purge to reclaim space.

## Key Differences from Other Dialects

| Feature | Vertica | PostgreSQL | MySQL | BigQuery |
|---------|---------|------------|-------|----------|
| Identifier quotes | `"double"` | `"double"` | `` `backtick` `` | `` `backtick` `` |
| Concat | `\|\|` | `\|\|` | `CONCAT` | `\|\|` |
| Case-insensitive LIKE | `ILIKE` | `ILIKE` | `LIKE` (default) | `LOWER()` workaround |
| Array index | 0-based | 1-based | N/A | 0-based |
| Date truncate | `DATE_TRUNC` | `DATE_TRUNC` | `DATE_FORMAT` | `DATE_TRUNC` |
| Date diff | `DATEDIFF` | Subtraction | `DATEDIFF` | `DATE_DIFF` |
| String agg | `LISTAGG` | `STRING_AGG` | `GROUP_CONCAT` | `STRING_AGG` |
| Approx distinct | `APPROXIMATE_COUNT_DISTINCT` | N/A | N/A | `APPROX_COUNT_DISTINCT` |
| Gap filling | `TIMESERIES` | N/A | N/A | N/A |
| Upsert | `MERGE` | `ON CONFLICT` | `ON DUPLICATE KEY` | `MERGE` |
