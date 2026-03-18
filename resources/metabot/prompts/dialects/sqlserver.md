# SQL Server (T-SQL) SQL Dialect Instructions

SQL Server uses Transact-SQL (T-SQL), Microsoft's SQL dialect. Follow these dialect-specific rules.

## Identifier Quoting

- Use **square brackets** for identifiers: `[Column Name]`, `[my-table]`
- Double quotes work if `QUOTED_IDENTIFIER` is ON (default)
- String literals use **single quotes** only: `'string value'`

```sql
SELECT [Column Name], [select], [order] FROM [My Table]
SELECT "Column Name" FROM "My Table"  -- Also valid
```

## String Operations

```sql
-- Concatenation: + operator or CONCAT function
SELECT first_name + ' ' + last_name AS full_name          -- NULL propagates!
SELECT CONCAT(first_name, ' ', last_name) AS full_name    -- NULL becomes empty string
SELECT CONCAT_WS(' ', first_name, middle, last_name)      -- With separator (SQL 2017+)

-- String functions
SELECT
  LOWER(name), UPPER(name),
  TRIM(name), LTRIM(name), RTRIM(name),                   -- TRIM is SQL 2017+
  SUBSTRING(name, 1, 3),                                  -- 1-indexed
  LEN(name),                                              -- Length excluding trailing spaces
  DATALENGTH(name),                                       -- Bytes
  REPLACE(name, 'old', 'new'),
  CHARINDEX('sub', name),                                 -- Find position (1-indexed, 0 if not found)
  PATINDEX('%pattern%', name),                            -- Pattern position
  LEFT(name, 3), RIGHT(name, 3),
  REPLICATE(str, 3),                                      -- Repeat string
  REVERSE(name),
  STRING_SPLIT(csv, ',')                                  -- Returns table (SQL 2016+)

-- Pattern matching
SELECT * FROM t WHERE name LIKE 'A%'                      -- Case-sensitivity depends on collation
SELECT * FROM t WHERE name LIKE 'A%' COLLATE Latin1_General_CS_AS  -- Force case-sensitive
SELECT * FROM t WHERE name LIKE '[A-Z]%'                  -- Character class
SELECT * FROM t WHERE name LIKE '[^0-9]%'                 -- Negated class
```

**Important**: String concatenation with `+` propagates NULL. Use `CONCAT()` or `ISNULL()` for NULL-safe concatenation.

## Date and Time

```sql
-- Current date/time
SELECT
  GETDATE(),                            -- DATETIME (local)
  GETUTCDATE(),                         -- DATETIME (UTC)
  SYSDATETIME(),                        -- DATETIME2 with higher precision
  CURRENT_TIMESTAMP,                    -- Same as GETDATE()
  CAST(GETDATE() AS DATE),              -- Date only
  CAST(GETDATE() AS TIME)               -- Time only

-- Date truncation
SELECT DATETRUNC(month, order_date)     -- SQL Server 2022+ only!
-- For older versions:
SELECT CAST(order_date AS DATE)                                         -- Truncate to day
SELECT DATEFROMPARTS(YEAR(order_date), MONTH(order_date), 1)            -- Truncate to month
SELECT DATEFROMPARTS(YEAR(order_date), 1, 1)                            -- Truncate to year
SELECT DATEADD(wk, DATEDIFF(wk, 0, order_date), 0)                       -- Truncate to week (Monday)

-- Date arithmetic
SELECT
  DATEADD(day, 7, order_date),
  DATEADD(month, 1, order_date),
  DATEADD(year, -1, order_date),
  DATEADD(hour, 2, order_datetime)

-- Date difference
SELECT
  DATEDIFF(day, start_date, end_date),          -- Integer difference
  DATEDIFF(month, start_date, end_date),
  DATEDIFF(year, start_date, end_date),
  DATEDIFF_BIG(second, start_dt, end_dt)        -- For large differences

-- Extraction
SELECT
  YEAR(order_date), MONTH(order_date), DAY(order_date),
  DATEPART(weekday, order_date),                -- 1=Sunday by default (depends on DATEFIRST)
  DATEPART(dayofyear, order_date),
  DATEPART(hour, ts), DATEPART(minute, ts), DATEPART(second, ts),
  DATEPART(quarter, order_date),
  DATEPART(week, order_date),
  DATENAME(month, order_date),                  -- 'January'
  DATENAME(weekday, order_date)                 -- 'Monday'

-- Formatting and parsing
SELECT
  FORMAT(order_date, 'yyyy-MM-dd'),             -- .NET format strings
  FORMAT(order_date, 'MMMM dd, yyyy'),          -- 'January 15, 2024'
  FORMAT(amount, 'C', 'en-US'),                 -- Currency: '$1,234.56'
  CONVERT(VARCHAR, order_date, 23),             -- 'YYYY-MM-DD' (style 23)
  CONVERT(VARCHAR, order_date, 101),            -- 'MM/DD/YYYY' (style 101)
  CAST('2024-01-15' AS DATE),
  TRY_CAST('invalid' AS DATE),                  -- Returns NULL on failure
  PARSE('January 15, 2024' AS DATE USING 'en-US')
```

**Critical**: `DATETRUNC` is SQL Server 2022+ only. Use `DATEFROMPARTS` or `DATEADD`/`DATEDIFF` patterns for older versions.

## Type Casting

```sql
-- CAST syntax (preferred)
SELECT CAST('123' AS INT)
SELECT CAST('123.45' AS DECIMAL(10,2))
SELECT CAST(123 AS VARCHAR(10))
SELECT CAST(order_date AS VARCHAR(10))
SELECT CAST('2024-01-15' AS DATE)
SELECT CAST('2024-01-15 10:30:00' AS DATETIME2)

-- CONVERT syntax (allows style codes)
SELECT CONVERT(INT, '123')
SELECT CONVERT(VARCHAR(10), order_date, 23)     -- With format style

-- TRY_ variants (return NULL on failure instead of error)
SELECT TRY_CAST('invalid' AS INT)               -- Returns NULL
SELECT TRY_CONVERT(INT, 'invalid')              -- Returns NULL

-- Type names: INT, BIGINT, SMALLINT, TINYINT, DECIMAL(p,s), NUMERIC(p,s),
--             FLOAT, REAL, MONEY, BIT, VARCHAR(n), NVARCHAR(n), CHAR(n),
--             DATE, TIME, DATETIME, DATETIME2, DATETIMEOFFSET, UNIQUEIDENTIFIER
```

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),    -- First non-null value (standard)
  ISNULL(nullable_col, 'default'),      -- SQL Server-specific, two args only
  NULLIF(col, ''),                      -- Returns NULL if col = ''
  IIF(col IS NULL, 'N/A', col)          -- Ternary (SQL 2012+)
```

**Note**: `ISNULL` differs from standard SQL. In T-SQL it's a null-coalescing function; in standard SQL it returns boolean.

## JSON Handling (SQL Server 2016+)

```sql
-- Extract from JSON
SELECT
  JSON_VALUE(json_col, '$.key'),                -- Scalar value as NVARCHAR
  JSON_QUERY(json_col, '$.object'),             -- Object/array as JSON string
  JSON_VALUE(json_col, '$.items[0].name'),      -- Nested access
  ISJSON(json_col)                              -- Validate (returns 1 or 0)

-- JSON_PATH_EXISTS (SQL 2022+)
SELECT JSON_PATH_EXISTS(json_col, '$.key')

-- OPENJSON: parse JSON to rows
SELECT * FROM OPENJSON('["a","b","c"]')         -- Returns key, value, type
SELECT * FROM OPENJSON(json_col, '$.items')
  WITH (
    id INT '$.id',
    name NVARCHAR(100) '$.name'
  )

-- Build JSON
SELECT
  (SELECT id, name FROM t FOR JSON PATH),               -- Array of objects
  (SELECT id, name FROM t FOR JSON AUTO),               -- Auto-nested
  (SELECT id, name FROM t FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)  -- Single object

-- JSON modification (SQL 2016+)
SELECT JSON_MODIFY(json_col, '$.key', 'new_value')
SELECT JSON_MODIFY(json_col, '$.newkey', 'value')       -- Insert
SELECT JSON_MODIFY(json_col, '$.key', NULL)             -- Remove
```

## Window Functions

```sql
SELECT
  ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC),
  RANK() OVER (ORDER BY amt DESC),
  DENSE_RANK() OVER (ORDER BY amt DESC),
  SUM(amt) OVER (PARTITION BY cat),
  LAG(amt, 1, 0) OVER (ORDER BY dt),
  LEAD(amt) OVER (ORDER BY dt),
  FIRST_VALUE(amt) OVER (ORDER BY dt ROWS UNBOUNDED PRECEDING),
  LAST_VALUE(amt) OVER (ORDER BY dt ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING),
  NTILE(4) OVER (ORDER BY amt),
  PERCENT_RANK() OVER (ORDER BY amt),
  CUME_DIST() OVER (ORDER BY amt)
FROM t
```

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amount), AVG(amount),
  MIN(val), MAX(val),
  STRING_AGG(col, ', '),                        -- SQL 2017+ (like LISTAGG)
  STRING_AGG(col, ', ') WITHIN GROUP (ORDER BY col),
  STDEV(amount), VAR(amount),
  CHECKSUM_AGG(CHECKSUM(col))
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
WITH subordinates AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id, s.depth + 1
  FROM employees e JOIN subordinates s ON e.manager_id = s.id
)
SELECT * FROM subordinates
```

## Pagination

```sql
-- TOP (no offset, just first N)
SELECT TOP 10 * FROM orders ORDER BY order_date DESC
SELECT TOP 10 PERCENT * FROM orders

-- OFFSET...FETCH (SQL 2012+, requires ORDER BY)
SELECT * FROM orders
ORDER BY order_date DESC
OFFSET 20 ROWS
FETCH NEXT 10 ROWS ONLY
```

**Critical**: SQL Server has no `LIMIT`. Use `TOP` for first N rows, `OFFSET...FETCH` for pagination.

## Upsert Pattern (MERGE)

```sql
MERGE INTO target_table AS t
USING source_table AS s ON t.id = s.id
WHEN MATCHED THEN
  UPDATE SET t.name = s.name, t.count = t.count + 1
WHEN NOT MATCHED THEN
  INSERT (id, name, count) VALUES (s.id, s.name, 1);

-- Simple upsert with single row
MERGE INTO t
USING (SELECT 1 AS id, 'foo' AS name) AS s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET name = s.name
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);
```

## Common Patterns

### Safe Division
```sql
SELECT
  NULLIF(denominator, 0),
  numerator / NULLIF(denominator, 0),
  IIF(denominator = 0, NULL, numerator * 1.0 / denominator)
```

### Conditional Aggregation
```sql
SELECT
  COUNT(*) AS total,
  SUM(IIF(status = 'active', 1, 0)) AS active_count,
  SUM(CASE WHEN type = 'revenue' THEN amount ELSE 0 END) AS revenue
FROM t
```

### First Row Per Group
```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY updated_at DESC) AS rn
  FROM products
) t WHERE rn = 1

-- Using CROSS APPLY
SELECT p.category, latest.*
FROM (SELECT DISTINCT category FROM products) p
CROSS APPLY (
  SELECT TOP 1 * FROM products WHERE category = p.category ORDER BY updated_at DESC
) latest
```

### Date Series Generation
```sql
WITH numbers AS (
  SELECT TOP 365 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n
  FROM sys.objects a CROSS JOIN sys.objects b
)
SELECT DATEADD(day, n, '2024-01-01') AS dt FROM numbers
```

### Table Variable
```sql
DECLARE @results TABLE (id INT, name VARCHAR(100))
INSERT INTO @results SELECT id, name FROM source WHERE active = 1
SELECT * FROM @results
```

## Key Differences from Other Dialects

| Feature | SQL Server | PostgreSQL | MySQL | BigQuery |
|---------|------------|------------|-------|----------|
| Identifier quotes | `[brackets]` | `"double"` | `` `backtick` `` | `` `backtick` `` |
| Concat | `+` or `CONCAT` | `\|\|` | `CONCAT` | `\|\|` |
| Date truncate | `DATETRUNC` (2022+) | `DATE_TRUNC` | `DATE_FORMAT` | `DATE_TRUNC` |
| Date add | `DATEADD(day, 7, d)` | `d + INTERVAL '7 days'` | `DATE_ADD` | `DATE_ADD` |
| Date diff | `DATEDIFF(day, a, b)` | `a - b` | `DATEDIFF` | `DATE_DIFF` |
| String agg | `STRING_AGG` (2017+) | `STRING_AGG` | `GROUP_CONCAT` | `STRING_AGG` |
| NULL function | `ISNULL` | `COALESCE` | `IFNULL` | `IFNULL` |
| Pagination | `TOP` / `OFFSET FETCH` | `LIMIT OFFSET` | `LIMIT OFFSET` | `LIMIT OFFSET` |
| JSON scalar | `JSON_VALUE` | `->>` | `->>` | `JSON_VALUE` |
| Upsert | `MERGE` | `ON CONFLICT` | `ON DUPLICATE KEY` | `MERGE` |
| First N rows | `TOP 10` | `LIMIT 10` | `LIMIT 10` | `LIMIT 10` |
