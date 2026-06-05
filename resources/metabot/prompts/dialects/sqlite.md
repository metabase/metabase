# SQLite SQL Dialect Instructions

SQLite is a lightweight embedded database with unique constraints. Follow these dialect-specific rules.

## Critical Limitations

- **No RIGHT JOIN or FULL OUTER JOIN** (use LEFT JOIN with UNION or subqueries)
- **No native BOOLEAN type** (uses INTEGER: 0=false, 1=true)
- **Dynamic typing** with type affinity (columns can store any type)
- **No DATE_TRUNC** (use `strftime` or `date` functions)
- **Limited concurrent writes** (single writer at a time)

## Identifier Quoting

- Use **double quotes** for identifiers: `"MyColumn"`, `"table-name"`
- Backticks also work: `` `column` ``
- String literals use **single quotes**: `'string value'`

```sql
SELECT "Column Name", "select" FROM "My Table"
```

## String Operations

```sql
-- Concatenation: || operator only
SELECT first_name || ' ' || last_name AS full_name

-- String functions
SELECT
  LOWER(name), UPPER(name),
  TRIM(name), LTRIM(name), RTRIM(name),
  SUBSTR(name, 1, 3),                   -- 1-indexed
  LENGTH(name),
  REPLACE(name, 'old', 'new'),
  INSTR(name, 'sub'),                   -- Find position (1-indexed, 0 if not found)
  PRINTF('%s %s', first, last)          -- Formatted string

-- Pattern matching
SELECT * FROM t WHERE name LIKE 'A%'    -- Case-insensitive by default!
SELECT * FROM t WHERE name GLOB 'A*'    -- Case-sensitive, uses * and ?
SELECT * FROM t WHERE name LIKE 'A%' ESCAPE '\'
```

**Important**: `LIKE` is case-insensitive for ASCII. `GLOB` is case-sensitive and uses `*` (not `%`) and `?` (not `_`).

## Date and Time

SQLite stores dates as TEXT, REAL, or INTEGER. Use string format `'YYYY-MM-DD HH:MM:SS'`.

```sql
-- Current date/time
SELECT
  DATE('now'),                          -- 'YYYY-MM-DD'
  TIME('now'),                          -- 'HH:MM:SS'
  DATETIME('now'),                      -- 'YYYY-MM-DD HH:MM:SS'
  DATETIME('now', 'localtime'),         -- Local timezone
  STRFTIME('%s', 'now'),                -- Unix timestamp
  JULIANDAY('now')                      -- Julian day number

-- Date truncation (no DATE_TRUNC! Use strftime or date modifiers)
SELECT DATE(order_date)                             -- Truncate to date
SELECT DATE(order_date, 'start of month')           -- Truncate to month
SELECT DATE(order_date, 'start of year')            -- Truncate to year
SELECT DATE(order_date, 'weekday 0', '-7 days')     -- Truncate to week (Sunday)
SELECT STRFTIME('%Y-%m', order_date)                -- 'YYYY-MM' string

-- Date arithmetic
SELECT
  DATE(order_date, '+7 days'),
  DATE(order_date, '-1 month'),
  DATE(order_date, '+1 year', '-1 day'),            -- Chain modifiers
  DATETIME(ts, '+2 hours', '+30 minutes')

-- Date difference (manual calculation)
SELECT JULIANDAY(end_date) - JULIANDAY(start_date) AS days_diff
SELECT CAST((JULIANDAY(end_date) - JULIANDAY(start_date)) AS INTEGER) AS whole_days

-- Extraction (via strftime)
SELECT
  STRFTIME('%Y', order_date) AS year,               -- '2024'
  STRFTIME('%m', order_date) AS month,              -- '01'
  STRFTIME('%d', order_date) AS day,                -- '15'
  STRFTIME('%H', ts) AS hour,                       -- '10'
  STRFTIME('%w', order_date) AS dow,                -- 0=Sunday, 6=Saturday
  STRFTIME('%j', order_date) AS day_of_year,        -- '015'
  STRFTIME('%W', order_date) AS week_number         -- '02'

-- Formatting
SELECT
  STRFTIME('%Y-%m-%d', order_date),
  STRFTIME('%m/%d/%Y', order_date),
  STRFTIME('%Y-%m-%d %H:%M:%S', ts)
```

**Critical**: SQLite has no `DATE_TRUNC`, `DATEADD`, `DATEDIFF`. Use `strftime` and `date` with modifiers.

## Type Casting

```sql
-- CAST syntax
SELECT CAST('123' AS INTEGER)
SELECT CAST('123.45' AS REAL)
SELECT CAST(123 AS TEXT)
SELECT CAST(order_date AS TEXT)

-- Type names: INTEGER, REAL, TEXT, BLOB, NUMERIC
-- Note: SQLite is dynamically typed; CAST is advisory
```

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),    -- First non-null value
  IFNULL(nullable_col, 'default'),      -- Two arguments only
  NULLIF(col, ''),                      -- Returns NULL if col = ''
  IIF(col IS NULL, 'N/A', col)          -- Ternary (SQLite 3.32+)
```

## JSON Handling (SQLite 3.38+)

```sql
-- Extract from JSON
SELECT
  JSON_EXTRACT(json_col, '$.key'),      -- Extract value
  json_col -> '$.key',                  -- Same (3.38+), returns JSON
  json_col ->> '$.key',                 -- Returns TEXT (3.38+)
  JSON_EXTRACT(json_col, '$.items[0]'), -- Array access (0-indexed)
  JSON_EXTRACT(json_col, '$.nested.path')

-- JSON functions
SELECT
  JSON_ARRAY_LENGTH(json_col, '$.items'),
  JSON_TYPE(json_col, '$.key'),
  JSON_VALID(json_col),
  JSON_ARRAY(1, 2, 3),
  JSON_OBJECT('a', 1, 'b', 2),
  JSON_GROUP_ARRAY(col),                -- Aggregate to JSON array
  JSON_GROUP_OBJECT(key, val)           -- Aggregate to JSON object

-- JSON modification
SELECT
  JSON_SET(json_col, '$.key', 'new'),
  JSON_INSERT(json_col, '$.key', 'val'),
  JSON_REPLACE(json_col, '$.key', 'val'),
  JSON_REMOVE(json_col, '$.key')

-- JSON_EACH: expand object/array to rows
SELECT key, value FROM t, JSON_EACH(t.json_col)
```

## Window Functions (SQLite 3.25+)

```sql
SELECT
  ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC),
  RANK() OVER w, DENSE_RANK() OVER w,
  SUM(amt) OVER (PARTITION BY cat),
  LAG(amt, 1, 0) OVER (ORDER BY dt),
  LEAD(amt) OVER (ORDER BY dt),
  FIRST_VALUE(amt) OVER w,
  LAST_VALUE(amt) OVER w,
  NTH_VALUE(amt, 2) OVER w,
  NTILE(4) OVER (ORDER BY amt)
FROM t
WINDOW w AS (PARTITION BY cat ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
```

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amount), AVG(amount),
  MIN(val), MAX(val),
  GROUP_CONCAT(col),                    -- String aggregation
  GROUP_CONCAT(col, '; '),              -- Custom separator
  GROUP_CONCAT(DISTINCT col),
  TOTAL(amount)                         -- Like SUM but returns 0.0 for empty, not NULL
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

-- Recursive CTE (for hierarchies, sequences)
WITH RECURSIVE subordinates AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id, s.depth + 1
  FROM employees e JOIN subordinates s ON e.manager_id = s.id
)
SELECT * FROM subordinates

-- Date series generation
WITH RECURSIVE dates(dt) AS (
  SELECT '2024-01-01'
  UNION ALL
  SELECT DATE(dt, '+1 day') FROM dates WHERE dt < '2024-12-31'
)
SELECT * FROM dates
```

## LIMIT and Pagination

```sql
SELECT * FROM t LIMIT 10
SELECT * FROM t LIMIT 10 OFFSET 20
```

## Upsert Pattern (SQLite 3.24+)

```sql
INSERT INTO t (id, name, count) VALUES (1, 'foo', 1)
ON CONFLICT(id) DO UPDATE SET count = count + 1, name = excluded.name

INSERT OR REPLACE INTO t (id, name) VALUES (1, 'new')  -- Older syntax
INSERT OR IGNORE INTO t (id, name) VALUES (1, 'foo')   -- Skip on conflict
```

## Common Patterns

### Safe Division
```sql
SELECT
  CASE WHEN denominator = 0 THEN NULL ELSE numerator / denominator END,
  IIF(denominator = 0, NULL, numerator * 1.0 / denominator)  -- Force float
```

### Boolean Handling
```sql
-- SQLite uses 0/1 for boolean
SELECT * FROM t WHERE active = 1
SELECT * FROM t WHERE active  -- Truthy check (non-zero)
SELECT IIF(condition, 'yes', 'no')
```

### First Row Per Group
```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY updated_at DESC) AS rn
  FROM products
) WHERE rn = 1
```

### Workaround for RIGHT JOIN
```sql
-- Instead of: SELECT * FROM a RIGHT JOIN b ON a.id = b.id
SELECT * FROM b LEFT JOIN a ON a.id = b.id
```

### Workaround for FULL OUTER JOIN
```sql
SELECT * FROM a LEFT JOIN b ON a.id = b.id
UNION
SELECT * FROM a RIGHT JOIN b ON a.id = b.id  -- If needed, use reverse LEFT JOIN
```

## Key Differences from Other Dialects

| Feature | SQLite | PostgreSQL | MySQL | BigQuery |
|---------|--------|------------|-------|----------|
| Identifier quotes | `"double"` or `` `backtick` `` | `"double"` | `` `backtick` `` | `` `backtick` `` |
| Concat | `\|\|` | `\|\|` | `CONCAT()` | `\|\|` |
| Date truncate | `DATE(..., 'start of month')` | `DATE_TRUNC` | `DATE_FORMAT` | `DATE_TRUNC` |
| Date diff | `JULIANDAY(a) - JULIANDAY(b)` | `a - b` | `DATEDIFF` | `DATE_DIFF` |
| String agg | `GROUP_CONCAT` | `STRING_AGG` | `GROUP_CONCAT` | `STRING_AGG` |
| NULL function | `IFNULL` | `COALESCE` | `IFNULL` | `IFNULL` |
| Boolean type | INTEGER (0/1) | `BOOLEAN` | TINYINT | `BOOL` |
| RIGHT JOIN | Not supported | Supported | Supported | Supported |
| FULL JOIN | Not supported | Supported | Not supported | Supported |
| Upsert | `ON CONFLICT` | `ON CONFLICT` | `ON DUPLICATE KEY` | `MERGE` |
