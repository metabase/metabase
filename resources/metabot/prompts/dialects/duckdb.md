# DuckDB SQL Dialect Instructions

These instructions are for DuckDB as served by MotherDuck. DuckDB accepts most PostgreSQL syntax, but several functions
and operators behave differently. Follow these dialect-specific rules.

## Identifiers and Schemas

- Use **double quotes** for identifiers with spaces, mixed case or reserved words: `"Order Date"`, `"group"`
- Identifiers are **case-insensitive, even when quoted**: `name`, `NAME` and `"name"` all find a column named `Name`
- String comparisons **are** case-sensitive: `'abc' = 'ABC'` is false
- String literals use **single quotes**: `'string value'`
- The default schema is **`main`**, not `public`: `SELECT * FROM main.orders`

## String Operations

```sql
SELECT
  first_name || ' ' || last_name,         -- concatenation; NULL if either side is NULL
  CONCAT(first_name, ' ', last_name),     -- skips NULLs
  CONCAT_WS(', ', city, state),           -- with separator, skips NULLs
  LOWER(s), UPPER(s), TRIM(s), LTRIM(s), RTRIM(s),
  SUBSTRING(s, 2, 3),                     -- 1-indexed: start, length
  LENGTH(s),
  REPLACE(s, 'old', 'new'),
  SPLIT_PART(csv, ',', 2),                -- nth element, 1-indexed
  STRING_SPLIT(csv, ','),                 -- to a list
  STRPOS(s, 'sub'),                       -- position of substring (0 if not found)
  LEFT(s, 3), RIGHT(s, 3),
  LPAD(code, 5, '0'), RPAD(s, 10, '.'),
  STARTS_WITH(s, 'pre'), ENDS_WITH(s, 'fix'), CONTAINS(s, 'mid')
```

**There is no `INITCAP`.**

### Pattern Matching

```sql
SELECT * FROM t WHERE name LIKE 'A%'                       -- case-sensitive
SELECT * FROM t WHERE name ILIKE 'a%'                      -- case-insensitive
SELECT * FROM t WHERE REGEXP_MATCHES(name, '^[A-Z]')       -- regex matches anywhere in the string
SELECT * FROM t WHERE REGEXP_MATCHES(name, '^a', 'i')      -- case-insensitive regex
SELECT
  REGEXP_EXTRACT(s, '[0-9]+'),                             -- first match
  REGEXP_EXTRACT(s, '([a-z]+)([0-9]+)', 2),                -- capture group 2
  REGEXP_EXTRACT_ALL(s, '[0-9]+'),                         -- all matches, as a list
  REGEXP_REPLACE(s, '[0-9]', '#', 'g')                     -- 'g' replaces all; without it, only the first
```

**Critical**: Don't use PostgreSQL's `~` operator. Here `~` must match the **whole** string, so `'abc' ~ '^a'` is
false. Use `REGEXP_MATCHES()` to find a pattern anywhere. `~*` doesn't exist.

Regular expressions use RE2 syntax: no lookahead or lookbehind, no backreferences.

## Date and Time

```sql
-- Current date/time
SELECT
  CURRENT_DATE,                           -- DATE
  NOW(),                                  -- TIMESTAMP WITH TIME ZONE (same as CURRENT_TIMESTAMP)
  LOCALTIMESTAMP                          -- TIMESTAMP, no time zone

-- Truncation: always returns a TIMESTAMP, even for a DATE
SELECT DATE_TRUNC('month', order_date)    -- year, quarter, month, week, day, hour, minute, second
SELECT DATE_TRUNC('week', order_date)     -- weeks start on Monday

-- Arithmetic
SELECT
  order_date + INTERVAL 7 DAY,            -- or INTERVAL '7 days'; DATE + INTERVAL is a TIMESTAMP
  order_date - INTERVAL 1 MONTH,
  created_at + INTERVAL '2 hours 30 minutes',
  order_date + 7,                         -- add days to a DATE; stays a DATE
  CURRENT_DATE - 30                       -- 30 days ago, as a DATE

-- Differences
SELECT
  end_date - start_date,                  -- DATE - DATE: whole days, as an integer
  ended_at - started_at,                  -- TIMESTAMP - TIMESTAMP: an INTERVAL
  DATE_DIFF('day', start_date, end_date), -- number of day boundaries crossed
  DATE_SUB('month', start_date, end_date),-- number of complete months
  AGE(ended_at, started_at)               -- INTERVAL in years, months and days
```

**Important**: `DATE_DIFF` counts unit **boundaries crossed**, so `DATE_DIFF('month', DATE '2024-01-31', DATE
'2024-02-01')` is 1. Use `DATE_SUB` for complete units: the same arguments give 0.

```sql
-- Extraction
SELECT
  EXTRACT(YEAR FROM order_date),          -- or YEAR(order_date), DATE_PART('year', order_date)
  MONTH(order_date), QUARTER(order_date), DAY(order_date),
  EXTRACT(DOW FROM order_date),           -- 0=Sunday, 6=Saturday
  EXTRACT(ISODOW FROM order_date),        -- 1=Monday, 7=Sunday
  DAYNAME(order_date), MONTHNAME(order_date),
  EPOCH(created_at),                      -- Unix seconds
  LAST_DAY(order_date)                    -- last day of the month

-- Formatting and parsing use strftime-style codes
SELECT
  STRFTIME(order_date, '%Y-%m-%d'),
  STRFTIME(created_at, '%b %d, %Y %H:%M'),          -- Jan 15, 2024 10:30
  STRPTIME('15/01/2024', '%d/%m/%Y')::DATE,         -- parse with a format
  '2024-01-15'::DATE,                               -- ISO strings cast directly
  MAKE_DATE(2024, 1, 15),
  TO_TIMESTAMP(1704067200)                          -- from Unix seconds (TIMESTAMP WITH TIME ZONE)
```

**There is no `TO_DATE`.** Use `STRPTIME(s, format)::DATE`. Prefer `STRFTIME` over `TO_CHAR`.

## Type Casting

```sql
SELECT '123'::INTEGER, '2024-01-15'::DATE, 123::VARCHAR     -- PostgreSQL shorthand works
SELECT CAST('1.5' AS DOUBLE)
SELECT TRY_CAST(raw_value AS INTEGER)                      -- NULL instead of an error

-- Types: INTEGER, BIGINT, HUGEINT, DOUBLE, DECIMAL(p,s), VARCHAR, BOOLEAN, DATE, TIME, TIMESTAMP,
--        TIMESTAMPTZ, INTERVAL, UUID, JSON, BLOB, lists (INTEGER[]), STRUCT, MAP
```

**Important**: a bare `DECIMAL` is `DECIMAL(18,3)` and rounds to 3 decimal places. Cast to `DOUBLE` or give a
precision.

## Numbers and Division

```sql
SELECT
  7 / 2,                                  -- 3.5: / always returns a DOUBLE, even for integers
  7 // 2,                                 -- 3: integer division
  7 % 2,
  ROUND(x, 2), CEIL(x), FLOOR(x), ABS(x),
  POWER(2, 10), SQRT(x), LN(x), LOG10(x),
  GREATEST(a, b), LEAST(a, b)
```

**Critical**: dividing by zero returns `Infinity` (or `NULL` with `//`), not an error. Guard divisions with
`NULLIF(denominator, 0)`.

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),
  IFNULL(nullable_col, 'default'),        -- two-argument COALESCE
  NULLIF(col, ''),
  col IS DISTINCT FROM other_col,         -- NULL-safe inequality
  col IS NOT DISTINCT FROM other_col      -- NULL-safe equality
```

**Important**: NULLs sort **last** in both directions by default, unlike PostgreSQL, where `DESC` puts them first.
Write `NULLS FIRST` or `NULLS LAST` when it matters.

## Lists (Arrays)

```sql
SELECT [1, 2, 3], ARRAY[1, 2, 3]          -- list literals
SELECT tags[1]                            -- 1-indexed; tags[-1] is the last element
SELECT tags[2:3]                          -- slice

SELECT
  LEN(tags),
  LIST_CONTAINS(tags, 'x'),               -- or: 'x' = ANY(tags)
  LIST_HAS_ANY(tags, ['x', 'y']),
  LIST_HAS_ALL(tags, ['x', 'y']),
  LIST_CONCAT(a, b), LIST_APPEND(tags, 'z'),
  LIST_POSITION(tags, 'x'),
  LIST_SORT(tags), LIST_DISTINCT(tags),
  ARRAY_TO_STRING(tags, ', '),
  LIST_FILTER(nums, x -> x > 1),          -- lambdas
  LIST_TRANSFORM(nums, x -> x * 10),
  LIST_SUM(nums)

-- Flatten a list to rows
SELECT id, UNNEST(tags) AS tag FROM t
SELECT t.id, u.tag FROM t, UNNEST(t.tags) AS u(tag)

-- Aggregate to a list
SELECT category, LIST(product ORDER BY product) FROM t GROUP BY category   -- or ARRAY_AGG
```

**Important**: PostgreSQL's `'{1,2,3}'::INT[]` literal doesn't work. Use `[1, 2, 3]`.

## Structs and JSON

```sql
-- STRUCT columns
SELECT address.city, address['zip'] FROM customers

-- JSON columns (there is no JSONB)
SELECT
  payload -> 'key',                       -- JSON
  payload ->> 'key',                      -- VARCHAR
  payload ->> '$.nested.key',             -- JSONPath
  payload -> 'items' -> 0,                -- array element, 0-indexed
  JSON_EXTRACT_STRING(payload, '$.nested.key'),
  JSON_ARRAY_LENGTH(payload, '$.items'),
  JSON_KEYS(payload)
FROM events

-- Building JSON
SELECT JSON_OBJECT('a', 1, 'b', 'x'), JSON_GROUP_ARRAY(id), JSON_GROUP_OBJECT(name, id) FROM t
```

**Important**: PostgreSQL's `#>`, `#>>`, `@>` and `?` JSON operators don't exist. JSON arrays are 0-indexed, unlike
lists.

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amount), AVG(amount), MIN(val), MAX(val),
  MEDIAN(amount),
  QUANTILE_CONT(amount, 0.9),             -- or PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY amount)
  MODE(category),
  APPROX_COUNT_DISTINCT(user_id),
  STRING_AGG(name, ', ' ORDER BY name),
  BOOL_AND(flag), BOOL_OR(flag),
  COUNT(*) FILTER (WHERE status = 'active'),
  SUM(amount) FILTER (WHERE type = 'revenue'),
  COUNT_IF(amount > 100),
  ARG_MAX(product, amount),               -- product with the largest amount (also MAX_BY)
  ARG_MIN(product, amount)
FROM t
```

### GROUP BY ALL and ORDER BY ALL

```sql
-- Group by every non-aggregated column in the SELECT list
SELECT category, region, SUM(amount) FROM sales GROUP BY ALL ORDER BY ALL
```

## Window Functions

```sql
SELECT
  ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC),
  RANK() OVER w, DENSE_RANK() OVER w,
  SUM(amt) OVER (PARTITION BY cat),
  SUM(amt) OVER (ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW),  -- moving sum
  LAG(amt, 1, 0) OVER (ORDER BY dt), LEAD(amt) OVER (ORDER BY dt),
  FIRST_VALUE(amt) OVER w, NTILE(4) OVER (ORDER BY amt)
FROM t
WINDOW w AS (PARTITION BY cat ORDER BY dt)
```

### QUALIFY

```sql
-- Filter on a window function without a subquery: latest row per customer
SELECT * FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) = 1
```

`DISTINCT ON (customer_id) ... ORDER BY customer_id, created_at DESC` also works.

## Column Selection

```sql
SELECT * EXCLUDE (password_hash, notes) FROM users           -- all columns but these
SELECT * EXCLUDE (notes) REPLACE (UPPER(name) AS name) FROM users  -- EXCLUDE comes before REPLACE
SELECT COLUMNS('^amount_') FROM sales                         -- columns matching a regex
SELECT 1 AS x, x + 1 AS y                                     -- reuse a SELECT alias
```

## Common Patterns

### CTEs
```sql
WITH active_users AS (
  SELECT * FROM users WHERE status = 'active'
)
SELECT * FROM active_users

WITH RECURSIVE n AS (SELECT 1 AS i UNION ALL SELECT i + 1 FROM n WHERE i < 10)
SELECT * FROM n
```

### Series
```sql
-- Call series functions in FROM. In the SELECT list, GENERATE_SERIES returns a single list.
SELECT * FROM RANGE(1, 11)                                    -- 1 to 10 (end exclusive)
SELECT * FROM GENERATE_SERIES(1, 10, 2)                       -- end inclusive
SELECT generate_series AS month
FROM GENERATE_SERIES(DATE '2024-01-01', DATE '2024-12-01', INTERVAL 1 MONTH)
```

### Safe Division
```sql
SELECT revenue / NULLIF(orders, 0) AS revenue_per_order
```

### Lateral Joins
```sql
SELECT u.id, recent.created_at
FROM users u,
LATERAL (SELECT created_at FROM orders o WHERE o.user_id = u.id ORDER BY created_at DESC LIMIT 3) AS recent
```

## Not Available

- **Temporary tables**: `CREATE TEMP TABLE` is refused. Use CTEs.
- **JSONB** and its operators, `INITCAP`, `TO_DATE`, `~*`, and `TO_CHAR` for numbers.
- **Files and URLs**: query only the database's tables. Don't use `read_csv`, `read_parquet`, `read_json` or other
  readers.

For number formatting, use `PRINTF('%,.2f', amount)` (gives `1,234,567.89`) or `ROUND(x, 2)::VARCHAR`.

## Key Differences from PostgreSQL

| Feature | DuckDB (MotherDuck) | PostgreSQL |
|---------|---------------------|------------|
| Default schema | `main` | `public` |
| Quoted identifiers | Case-insensitive | Case-sensitive |
| `7 / 2` | `3.5` | `3` |
| Integer division | `7 // 2` | `7 / 2` |
| Divide by zero | `Infinity` | Error |
| Regex `~` | Whole-string match | Match anywhere |
| Regex anywhere | `REGEXP_MATCHES(s, 'p')` | `s ~ 'p'` |
| `DESC` sort | NULLs last | NULLs first |
| Date formatting | `STRFTIME(d, '%Y-%m')` | `TO_CHAR(d, 'YYYY-MM')` |
| Date parsing | `STRPTIME(s, '%d/%m/%Y')` | `TO_DATE(s, 'DD/MM/YYYY')` |
| Array literal | `[1, 2, 3]` | `'{1,2,3}'::INT[]` |
| JSON | `JSON` only | `JSON`, `JSONB` |
| First per group | `QUALIFY` or `DISTINCT ON` | `DISTINCT ON` |
| Group by all columns | `GROUP BY ALL` | List them |
