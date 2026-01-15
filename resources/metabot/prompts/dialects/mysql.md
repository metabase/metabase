# MySQL SQL Dialect Instructions

MySQL is a widely-used relational database. These instructions cover MySQL 8.0+ syntax. Follow these dialect-specific rules.

## Identifier Quoting

- Use **backticks** for identifiers: `` `column_name` ``, `` `table-name` ``
- String literals use **single quotes** or **double quotes** (depending on `sql_mode`)
- Identifiers are **case-sensitive** on Linux, **case-insensitive** on Windows/macOS

```sql
SELECT `select`, `order` FROM `my-table`   -- Reserved words need backticks
```

## String Operations

```sql
-- Concatenation: CONCAT function only (|| does NOT work by default!)
SELECT CONCAT(first_name, ' ', last_name) AS full_name
SELECT CONCAT_WS(' ', first_name, middle, last_name)  -- With separator, skips NULLs

-- String functions
SELECT
  LOWER(name), UPPER(name),
  TRIM(name), LTRIM(name), RTRIM(name),
  SUBSTRING(name, 1, 3),                  -- 1-indexed, or: SUBSTR, MID
  SUBSTRING_INDEX(csv, ',', 1),           -- Extract before nth delimiter
  SUBSTRING_INDEX(csv, ',', -1),          -- Extract after last delimiter
  LENGTH(name),                           -- Bytes
  CHAR_LENGTH(name),                      -- Characters
  REPLACE(name, 'old', 'new'),
  LOCATE('sub', name),                    -- Find position (1-indexed, 0 if not found)
  LEFT(name, 3), RIGHT(name, 3),
  LPAD(num, 5, '0'), RPAD(name, 10, ' '),
  REVERSE(name),
  REPEAT(str, 3)

-- Pattern matching
SELECT * FROM t WHERE name LIKE 'A%'      -- Case-insensitive by default!
SELECT * FROM t WHERE name LIKE BINARY 'A%'  -- Force case-sensitive
SELECT * FROM t WHERE name REGEXP '^[A-Z]'   -- Regular expression
SELECT * FROM t WHERE name RLIKE '^[A-Z]'    -- Synonym for REGEXP
SELECT REGEXP_REPLACE(text, 'pattern', 'replacement')  -- MySQL 8.0+
SELECT REGEXP_SUBSTR(text, 'pattern')                  -- MySQL 8.0+
```

**Important**: MySQL string comparison is case-insensitive by default (depends on collation). Use `BINARY` or appropriate collation for case-sensitive matching.

## Date and Time

```sql
-- Current date/time
SELECT
  CURRENT_DATE, CURDATE(),                -- DATE
  CURRENT_TIMESTAMP, NOW(),               -- DATETIME
  CURRENT_TIME, CURTIME(),                -- TIME
  UTC_TIMESTAMP(), UTC_DATE()

-- Date truncation (no DATE_TRUNC! Use DATE_FORMAT or DATE)
SELECT DATE(order_datetime)               -- Truncate to date
SELECT DATE_FORMAT(order_date, '%Y-%m-01')         -- Truncate to month
SELECT DATE_FORMAT(order_date, '%Y-01-01')         -- Truncate to year
SELECT DATE(order_date - INTERVAL (DAYOFWEEK(order_date) - 1) DAY)  -- Truncate to week (Sunday)
SELECT DATE(order_date - INTERVAL (WEEKDAY(order_date)) DAY)        -- Truncate to week (Monday)

-- Date arithmetic
SELECT
  DATE_ADD(order_date, INTERVAL 7 DAY),   -- Or: order_date + INTERVAL 7 DAY
  DATE_SUB(order_date, INTERVAL 1 MONTH),
  order_date + INTERVAL 2 HOUR,
  ADDDATE(order_date, 7),                 -- Add days (integer)
  TIMESTAMPADD(HOUR, 2, order_datetime)

-- Date difference
SELECT
  DATEDIFF(end_date, start_date),         -- Returns integer days only
  TIMESTAMPDIFF(MONTH, start_date, end_date),  -- YEAR, MONTH, DAY, HOUR, MINUTE, SECOND
  TIMESTAMPDIFF(HOUR, start_dt, end_dt),
  TIMEDIFF(end_time, start_time)          -- Returns TIME

-- Extraction
SELECT
  YEAR(order_date), MONTH(order_date), DAY(order_date),
  DAYOFWEEK(order_date),                  -- 1=Sunday, 7=Saturday
  WEEKDAY(order_date),                    -- 0=Monday, 6=Sunday
  DAYOFYEAR(order_date),
  HOUR(dt), MINUTE(dt), SECOND(dt),
  EXTRACT(YEAR FROM order_date),
  EXTRACT(MONTH FROM order_date)

-- Formatting and parsing
SELECT
  DATE_FORMAT(order_date, '%Y-%m-%d'),
  DATE_FORMAT(order_date, '%M %d, %Y'),   -- 'January 15, 2024'
  DATE_FORMAT(order_date, '%W'),          -- Day name
  TIME_FORMAT(time_col, '%H:%i'),
  STR_TO_DATE('2024-01-15', '%Y-%m-%d'),
  STR_TO_DATE('Jan 15, 2024', '%b %d, %Y')
```

**Critical**: MySQL has no `DATE_TRUNC`. Use `DATE_FORMAT` to truncate to month/year, or `DATE()` to truncate timestamp to date.

## Type Casting

```sql
-- CAST syntax
SELECT CAST(string_col AS SIGNED)         -- Integer
SELECT CAST(string_col AS UNSIGNED)       -- Unsigned integer
SELECT CAST(string_col AS DECIMAL(10,2))
SELECT CAST(string_col AS CHAR)
SELECT CAST(string_col AS DATE)
SELECT CAST(string_col AS DATETIME)
SELECT CAST(string_col AS TIME)

-- CONVERT syntax (equivalent)
SELECT CONVERT(string_col, SIGNED)
SELECT CONVERT(string_col, DECIMAL(10,2))

-- Implicit conversion
SELECT string_col + 0                     -- String to number
SELECT CONCAT('', number_col)             -- Number to string
```

**Important**: MySQL uses `SIGNED`/`UNSIGNED` instead of `INTEGER`/`BIGINT` in CAST.

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),      -- First non-null value
  IFNULL(nullable_col, 'default'),        -- MySQL-specific, two arguments only
  NULLIF(col, ''),                        -- Returns NULL if col = ''
  IF(col IS NULL, 'N/A', col),            -- Ternary
  ISNULL(col)                             -- Returns 1 if NULL, 0 otherwise (not standard!)
```

## JSON Handling (MySQL 5.7+)

```sql
-- Extract from JSON
SELECT
  json_col -> '$.key',                    -- Returns JSON
  json_col ->> '$.key',                   -- Returns unquoted TEXT (MySQL 5.7.13+)
  JSON_EXTRACT(json_col, '$.key'),        -- Same as ->
  JSON_UNQUOTE(JSON_EXTRACT(json_col, '$.key')),  -- Same as ->>
  JSON_EXTRACT(json_col, '$.items[0]'),   -- Array access (0-indexed)
  JSON_EXTRACT(json_col, '$.nested.path')

-- JSON functions
SELECT
  JSON_LENGTH(json_col),                  -- Array/object length
  JSON_KEYS(json_col),                    -- Get keys as JSON array
  JSON_TYPE(json_col),                    -- Get type
  JSON_VALID(json_col),                   -- Validate JSON
  JSON_CONTAINS(json_col, '"value"', '$.array'),  -- Check if value in array
  JSON_CONTAINS_PATH(json_col, 'one', '$.key'),   -- Check path exists
  JSON_ARRAY(1, 2, 3),                    -- Build array
  JSON_OBJECT('a', 1, 'b', 2),            -- Build object
  JSON_ARRAYAGG(col),                     -- Aggregate to JSON array
  JSON_OBJECTAGG(key_col, val_col)        -- Aggregate to JSON object

-- JSON modification
SELECT
  JSON_SET(json_col, '$.key', 'new_value'),      -- Set (insert or update)
  JSON_INSERT(json_col, '$.key', 'value'),       -- Insert only if not exists
  JSON_REPLACE(json_col, '$.key', 'value'),      -- Replace only if exists
  JSON_REMOVE(json_col, '$.key')
```

## Window Functions (MySQL 8.0+)

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
  NTILE(4) OVER (ORDER BY amt),
  PERCENT_RANK() OVER w, CUME_DIST() OVER w
FROM t
WINDOW w AS (PARTITION BY cat ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
```

**Note**: Window functions require MySQL 8.0+. Earlier versions need subqueries or variables.

## Common Table Expressions (MySQL 8.0+)

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

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amount), AVG(amount),
  MIN(val), MAX(val),
  GROUP_CONCAT(col),                      -- MySQL-specific string aggregation
  GROUP_CONCAT(col ORDER BY sort_col),
  GROUP_CONCAT(col SEPARATOR '; '),       -- Custom separator
  GROUP_CONCAT(DISTINCT col ORDER BY col),
  BIT_AND(flags), BIT_OR(flags)
FROM t
GROUP BY category
```

**Important**: `GROUP_CONCAT` has a default length limit (`group_concat_max_len`, default 1024). May truncate silently.

## LIMIT and Pagination

```sql
-- MySQL syntax
SELECT * FROM t LIMIT 10                  -- First 10 rows
SELECT * FROM t LIMIT 10 OFFSET 20        -- Skip 20, return 10
SELECT * FROM t LIMIT 20, 10              -- Alternative: LIMIT offset, count
```

## Upsert Pattern

```sql
-- ON DUPLICATE KEY UPDATE (requires unique key)
INSERT INTO t (id, name, count)
VALUES (1, 'foo', 1)
ON DUPLICATE KEY UPDATE count = count + 1, name = VALUES(name)

-- REPLACE INTO (deletes and re-inserts)
REPLACE INTO t (id, name) VALUES (1, 'new_name')
```

## Common Patterns

### Safe Division
```sql
SELECT
  numerator / NULLIF(denominator, 0),
  IF(denominator = 0, 0, numerator / denominator)
```

### Integer Division
```sql
SELECT 10 DIV 3            -- Returns 3 (integer division)
SELECT 10 / 3              -- Returns 3.3333 (decimal)
SELECT 10 MOD 3, 10 % 3    -- Modulo
```

### Conditional Aggregation
```sql
SELECT
  COUNT(*) AS total,
  SUM(status = 'active') AS active_count,        -- Boolean = 1/0 in MySQL
  SUM(IF(type = 'revenue', amount, 0)) AS revenue,
  COUNT(IF(region = 'US', 1, NULL)) AS us_count  -- COUNT ignores NULL
FROM t
```

### Date Spine Generation
```sql
-- Requires MySQL 8.0+ recursive CTE
WITH RECURSIVE dates AS (
  SELECT '2024-01-01' AS dt
  UNION ALL
  SELECT dt + INTERVAL 1 DAY FROM dates WHERE dt < '2024-12-31'
)
SELECT * FROM dates
```

### Get First Row Per Group (no DISTINCT ON)
```sql
-- Using window function (MySQL 8.0+)
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY updated_at DESC) AS rn
  FROM products
) t WHERE rn = 1

-- Using correlated subquery (works in older MySQL)
SELECT p.* FROM products p
WHERE p.updated_at = (
  SELECT MAX(updated_at) FROM products WHERE category = p.category
)
```

## Key Differences from Other Dialects

| Feature | MySQL | PostgreSQL | BigQuery | Snowflake |
|---------|-------|------------|----------|-----------|
| Identifier quotes | `` `backtick` `` | `"double"` | `` `backtick` `` | `"double"` |
| Concat | `CONCAT()` | `\|\|` | `\|\|` or `CONCAT` | `\|\|` |
| String compare | Case-insensitive* | Case-sensitive | Case-sensitive | Case-sensitive* |
| Date truncate | `DATE_FORMAT` | `DATE_TRUNC` | `DATE_TRUNC` | `DATE_TRUNC` |
| Date diff | `DATEDIFF` (days) | Subtraction | `DATE_DIFF` | `DATEDIFF` |
| String agg | `GROUP_CONCAT` | `STRING_AGG` | `STRING_AGG` | `LISTAGG` |
| JSON path | `$.key` | `->`, `->>` | JSONPath | `:key` |
| Cast to int | `CAST(x AS SIGNED)` | `x::INTEGER` | `CAST(x AS INT64)` | `x::INTEGER` |
| Upsert | `ON DUPLICATE KEY` | `ON CONFLICT` | `MERGE` | `MERGE` |
| LIMIT syntax | `LIMIT n OFFSET m` | Same | Same | Same |

*Depends on collation setting
