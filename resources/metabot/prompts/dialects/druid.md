# Apache Druid SQL Dialect Instructions

Druid uses a SQL layer over its native query engine, optimized for real-time analytics and time-series data. Follow these dialect-specific rules.

## Key Constraints

- **No JOINs** between Druid tables (only broadcast/lookup joins supported)
- **No full outer joins** or **right outer joins**
- **Limited subquery support** - subqueries must be in FROM clause
- **No DISTINCT in aggregate functions** (except `COUNT(DISTINCT)` with approximation)
- **Immutable data** - no UPDATE or DELETE on regular tables
- **Required time column** - most tables have `__time` as the primary timestamp

## Identifier Quoting

- Use **double quotes** for identifiers: `"my column"`, `"table-name"`
- String literals use **single quotes**: `'string value'`
- Identifiers are **case-sensitive**

```sql
SELECT "Column Name" FROM "my-datasource" WHERE "status" = 'active'
```

## String Operations

```sql
-- Concatenation: || operator or CONCAT function
SELECT first_name || ' ' || last_name AS full_name
SELECT CONCAT(first_name, ' ', last_name) AS full_name

-- String functions
SELECT
  LOWER(name), UPPER(name),
  TRIM(name), LTRIM(name), RTRIM(name),
  SUBSTR(name, 1, 3),                    -- Alias: SUBSTRING (1-indexed)
  LENGTH(name), CHAR_LENGTH(name),
  REPLACE(name, 'old', 'new'),
  POSITION('sub' IN name),               -- Find substring position
  STRPOS(name, 'sub'),                   -- Alternative syntax
  LPAD(str, 10, '0'), RPAD(str, 10, ' '),
  REVERSE(str),
  REPEAT(str, 3),
  REGEXP_EXTRACT(text, 'pattern'),       -- First capture group
  REGEXP_LIKE(text, 'pattern')           -- Returns BOOLEAN

-- Pattern matching
SELECT * FROM t WHERE name LIKE 'A%'
```

## Date and Time

Druid has a special `__time` column in most datasources representing the primary timestamp.

```sql
-- Current timestamp
SELECT CURRENT_TIMESTAMP

-- Time filtering (critical for performance!)
SELECT * FROM events
WHERE __time >= TIMESTAMP '2024-01-01' AND __time < TIMESTAMP '2024-02-01'

-- Date truncation (TIME_FLOOR is Druid-specific and preferred)
SELECT TIME_FLOOR(__time, 'P1D') AS day           -- ISO 8601 periods
SELECT TIME_FLOOR(__time, 'PT1H') AS hour         -- P1D=day, PT1H=hour, P1M=month
SELECT TIME_FLOOR(__time, 'P1D', NULL, 'America/New_York') AS day  -- With timezone
SELECT DATE_TRUNC('day', __time) AS day           -- Standard SQL alternative

-- Time arithmetic
SELECT TIME_SHIFT(__time, 'P1D', 1) AS next_day   -- Add 1 day
SELECT TIME_SHIFT(__time, 'P1D', -1) AS prev_day  -- Subtract 1 day
SELECT TIME_SHIFT(__time, 'PT1H', 2) AS plus_2h   -- Add 2 hours
SELECT TIMESTAMPADD(DAY, 7, __time)               -- Add 7 days
SELECT TIMESTAMPDIFF(DAY, start_time, end_time)   -- Days between

-- Extraction
SELECT
  EXTRACT(YEAR FROM __time),
  EXTRACT(MONTH FROM __time),
  EXTRACT(DAY FROM __time),
  EXTRACT(HOUR FROM __time),
  TIME_EXTRACT(__time, 'YEAR'),          -- Druid-specific
  TIME_EXTRACT(__time, 'DOW')            -- Day of week (1=Monday)

-- Formatting and parsing
SELECT
  TIME_FORMAT(__time, 'yyyy-MM-dd'),                         -- Joda time format
  TIME_FORMAT(__time, 'yyyy-MM-dd HH:mm:ss', 'UTC'),
  TIME_PARSE('2024-01-15 10:30:00', 'yyyy-MM-dd HH:mm:ss'),  -- Parse to timestamp
  MILLIS_TO_TIMESTAMP(epoch_millis),
  TIMESTAMP_TO_MILLIS(__time)
```

**Critical**: Always filter on `__time` for query performance. Druid partitions data by time.

## ISO 8601 Period Notation

TIME_FLOOR and TIME_SHIFT use ISO 8601 periods:
- `P1D` - 1 day
- `P1W` - 1 week
- `P1M` - 1 month
- `P1Y` - 1 year
- `PT1H` - 1 hour
- `PT1M` - 1 minute
- `PT1S` - 1 second

## Type Casting

```sql
-- CAST syntax
SELECT CAST(string_col AS BIGINT)
SELECT CAST(string_col AS DOUBLE)
SELECT CAST(string_col AS VARCHAR)
SELECT CAST(__time AS DATE)

-- Type names: VARCHAR, BIGINT, DOUBLE, FLOAT, BOOLEAN, TIMESTAMP, DATE
-- Note: No DECIMAL/NUMERIC - use DOUBLE for decimal values
```

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),     -- First non-null value
  NVL(nullable_col, 'default'),          -- Two-argument coalesce
  NULLIF(col, ''),                       -- Returns NULL if col = ''
  CASE WHEN col IS NULL THEN 'N/A' ELSE col END
```

## Aggregation

Druid is optimized for aggregation. These are the core functions:

```sql
SELECT
  COUNT(*), COUNT(col),
  SUM(amount), AVG(amount),
  MIN(val), MAX(val),
  EARLIEST(col),                         -- First value by __time
  LATEST(col),                           -- Last value by __time
  EARLIEST(col, 100),                    -- With max bytes
  LATEST(col, 100),
  EARLIEST_BY(col, __time),              -- Explicit time column
  LATEST_BY(col, __time),
  ANY_VALUE(col),                        -- Arbitrary value from group
  -- Approximate functions (fast, memory-efficient)
  APPROX_COUNT_DISTINCT(col),            -- HyperLogLog
  APPROX_COUNT_DISTINCT_DS_HLL(col),     -- DataSketches HLL
  APPROX_COUNT_DISTINCT_DS_THETA(col),   -- DataSketches Theta
  DS_QUANTILES_SKETCH(col),              -- Quantile sketch
  APPROX_QUANTILE_DS(sketch_col, 0.5),   -- Median from sketch
  -- String aggregation
  STRING_AGG(col, ', '),                 -- Concatenate strings
  LISTAGG(col, ', ')                     -- Alias for STRING_AGG
FROM events
WHERE __time >= TIMESTAMP '2024-01-01'
GROUP BY TIME_FLOOR(__time, 'P1D')
```

**Important**: `COUNT(DISTINCT col)` uses approximation by default. For exact counts on small cardinalities, use `APPROX_COUNT_DISTINCT` with appropriate accuracy settings.

## Window Functions

Druid has limited window function support:

```sql
SELECT
  ROW_NUMBER() OVER (ORDER BY amount DESC),
  ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC),
  SUM(amount) OVER (ORDER BY __time ROWS UNBOUNDED PRECEDING) AS running_total,
  LAG(amount, 1) OVER (ORDER BY __time),
  LEAD(amount, 1) OVER (ORDER BY __time)
FROM t
```

**Note**: Window functions may be slower than native Druid aggregations. Prefer TIME_FLOOR grouping when possible.

## Subqueries and Derived Tables

```sql
-- Subquery in FROM (supported)
SELECT category, total
FROM (
  SELECT category, SUM(amount) AS total
  FROM sales
  WHERE __time >= TIMESTAMP '2024-01-01'
  GROUP BY category
)
WHERE total > 1000

-- Subquery in WHERE with IN (supported)
SELECT * FROM orders
WHERE product_id IN (
  SELECT product_id FROM popular_products
)
```

## Lookup Joins

Druid supports joining with lookup tables (dimension tables):

```sql
-- LOOKUP function (inline)
SELECT
  user_id,
  LOOKUP(country_code, 'country_names') AS country_name
FROM events

-- JOIN with lookup table
SELECT e.*, l.country_name
FROM events e
LEFT JOIN LOOKUP.country_lookup l ON e.country_code = l.k
```

## Common Table Expressions (CTEs)

```sql
WITH daily_totals AS (
  SELECT
    TIME_FLOOR(__time, 'P1D') AS day,
    SUM(amount) AS total
  FROM sales
  WHERE __time >= TIMESTAMP '2024-01-01'
  GROUP BY 1
)
SELECT * FROM daily_totals WHERE total > 1000
```

## GROUP BY Variations

```sql
-- Standard GROUP BY
SELECT category, SUM(amount) FROM t GROUP BY category

-- GROUP BY with ordinal
SELECT category, SUM(amount) FROM t GROUP BY 1

-- GROUPING SETS (for multiple grouping levels)
SELECT
  TIME_FLOOR(__time, 'P1D') AS day,
  category,
  SUM(amount) AS total
FROM sales
GROUP BY GROUPING SETS (
  (TIME_FLOOR(__time, 'P1D'), category),
  (TIME_FLOOR(__time, 'P1D')),
  ()
)

-- ROLLUP (hierarchical totals)
SELECT day, category, SUM(amount)
FROM sales
GROUP BY ROLLUP(day, category)
```

## LIMIT and Pagination

```sql
-- Basic limit
SELECT * FROM t LIMIT 100

-- Offset (use with caution - can be slow)
SELECT * FROM t ORDER BY __time LIMIT 100 OFFSET 200
```

## Performance Considerations

### Time Filtering
```sql
-- Good: filter on __time first
SELECT * FROM events
WHERE __time >= TIMESTAMP '2024-01-01'
  AND __time < TIMESTAMP '2024-02-01'
  AND status = 'active'

-- Bad: missing time filter scans all data
SELECT * FROM events WHERE status = 'active'
```

### Use TIME_FLOOR for Time-Series Aggregation
```sql
-- Good: TIME_FLOOR is optimized for Druid
SELECT TIME_FLOOR(__time, 'PT1H') AS hour, COUNT(*)
FROM events
WHERE __time >= TIMESTAMP '2024-01-01'
GROUP BY 1

-- Less efficient: DATE_TRUNC works but TIME_FLOOR is preferred
SELECT DATE_TRUNC('hour', __time) AS hour, COUNT(*)
FROM events
GROUP BY 1
```

### Approximate Aggregations
```sql
-- Fast: approximate count distinct
SELECT APPROX_COUNT_DISTINCT(user_id) FROM events

-- Slow: exact count distinct (avoid on high cardinality)
SELECT COUNT(DISTINCT user_id) FROM events
```

## Common Patterns

### Safe Division
```sql
SELECT
  CASE WHEN denominator = 0 THEN 0 ELSE numerator / denominator END,
  numerator / NULLIF(denominator, 0)
```

### Time Bucketing with Counts
```sql
SELECT
  TIME_FLOOR(__time, 'PT1H') AS hour,
  COUNT(*) AS events,
  APPROX_COUNT_DISTINCT(user_id) AS unique_users
FROM events
WHERE __time >= CURRENT_TIMESTAMP - INTERVAL '7' DAY
GROUP BY 1
ORDER BY 1
```

### Latest Value Per Group
```sql
SELECT
  user_id,
  LATEST(status) AS current_status,
  LATEST(amount) AS last_amount
FROM events
WHERE __time >= TIMESTAMP '2024-01-01'
GROUP BY user_id
```

### Conditional Aggregation
```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status = 'error' THEN amount ELSE 0 END) AS error_amount
FROM events
WHERE __time >= TIMESTAMP '2024-01-01'
```

## Key Differences from Other Dialects

| Feature | Druid | BigQuery | PostgreSQL | Snowflake |
|---------|-------|----------|------------|-----------|
| Identifier quotes | `"double"` | `` `backtick` `` | `"double"` | `"double"` |
| JOINs | Lookup only | Full support | Full support | Full support |
| Time truncate | `TIME_FLOOR` | `DATE_TRUNC` | `DATE_TRUNC` | `DATE_TRUNC` |
| Time periods | ISO 8601 (`P1D`) | `INTERVAL` | `INTERVAL` | `INTERVAL` |
| Approx distinct | `APPROX_COUNT_DISTINCT` | `APPROX_COUNT_DISTINCT` | N/A | `APPROX_COUNT_DISTINCT` |
| Latest value | `LATEST()` | Window function | Window function | Window function |
| Subqueries | FROM only | Full support | Full support | Full support |
| Window functions | Limited | Full support | Full support | Full support |
| UPDATE/DELETE | No | Limited | Yes | Yes |
