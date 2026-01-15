# Oracle SQL Dialect Instructions

Oracle Database uses PL/SQL-extended SQL with unique syntax. Follow these dialect-specific rules.

## Identifier Quoting

- Use **double quotes** for identifiers: `"MyColumn"`, `"table-name"`
- Unquoted identifiers are **uppercased**: `SELECT mycolumn` becomes `MYCOLUMN`
- String literals use **single quotes** only: `'string value'`

```sql
SELECT "CamelCaseColumn", "reserved-word" FROM "My Table"
```

## DUAL Table

Oracle requires `FROM` clause. Use `DUAL` for expressions without a table:

```sql
SELECT SYSDATE FROM DUAL
SELECT 1 + 1 FROM DUAL
SELECT 'constant' FROM DUAL
```

## String Operations

```sql
-- Concatenation: || operator (preferred) or CONCAT (two args only)
SELECT first_name || ' ' || last_name AS full_name
SELECT CONCAT(CONCAT(first_name, ' '), last_name)  -- Only 2 args!

-- String functions
SELECT
  LOWER(name), UPPER(name), INITCAP(name),
  TRIM(name), LTRIM(name), RTRIM(name),
  SUBSTR(name, 1, 3),                   -- 1-indexed
  LENGTH(name),
  REPLACE(name, 'old', 'new'),
  INSTR(name, 'sub'),                   -- Find position (1-indexed, 0 if not found)
  INSTR(name, 'sub', 1, 2),             -- 2nd occurrence
  LPAD(str, 10, '0'), RPAD(str, 10, ' '),
  REVERSE(name),                        -- 21c+, or use custom function
  REGEXP_REPLACE(text, 'pattern', 'replacement'),
  REGEXP_SUBSTR(text, 'pattern')

-- Pattern matching
SELECT * FROM t WHERE name LIKE 'A%'            -- Case-sensitive
SELECT * FROM t WHERE UPPER(name) LIKE 'A%'     -- Case-insensitive workaround
SELECT * FROM t WHERE REGEXP_LIKE(name, '^[A-Z]')
SELECT * FROM t WHERE REGEXP_LIKE(name, '^[A-Z]', 'i')  -- 'i' = case-insensitive
```

**Important**: Oracle `CONCAT` only accepts 2 arguments. Use `||` for multiple values.

## Date and Time

```sql
-- Current date/time
SELECT
  SYSDATE,                              -- DATE (includes time)
  SYSTIMESTAMP,                         -- TIMESTAMP WITH TIME ZONE
  CURRENT_DATE,                         -- Session timezone
  CURRENT_TIMESTAMP                     -- Session timezone with precision
FROM DUAL

-- Date truncation (TRUNC, not DATE_TRUNC!)
SELECT TRUNC(order_date)                        -- Truncate to day (removes time)
SELECT TRUNC(order_date, 'MM')                  -- Truncate to month
SELECT TRUNC(order_date, 'Q')                   -- Truncate to quarter
SELECT TRUNC(order_date, 'YYYY')                -- Truncate to year
SELECT TRUNC(order_date, 'IW')                  -- Truncate to ISO week (Monday)
SELECT TRUNC(order_date, 'WW')                  -- Truncate to week (same day as Jan 1)
SELECT TRUNC(order_date, 'HH')                  -- Truncate to hour

-- Date arithmetic
SELECT
  order_date + 7,                               -- Add 7 days
  order_date - 1,                               -- Subtract 1 day
  order_date + INTERVAL '7' DAY,
  order_date + INTERVAL '1' MONTH,
  order_date + INTERVAL '2' HOUR,
  ADD_MONTHS(order_date, 3)                     -- Add months (handles month-end)

-- Date difference
SELECT
  end_date - start_date,                        -- Days as number
  MONTHS_BETWEEN(end_date, start_date),         -- Months (can be fractional)
  EXTRACT(DAY FROM (end_date - start_date))     -- Days from interval

-- Extraction
SELECT
  EXTRACT(YEAR FROM order_date),
  EXTRACT(MONTH FROM order_date),
  EXTRACT(DAY FROM order_date),
  EXTRACT(HOUR FROM ts),
  EXTRACT(MINUTE FROM ts),
  TO_CHAR(order_date, 'D'),                     -- Day of week (1=Sunday)
  TO_CHAR(order_date, 'DDD'),                   -- Day of year
  TO_CHAR(order_date, 'Q'),                     -- Quarter
  TO_CHAR(order_date, 'IW')                     -- ISO week number

-- Formatting and parsing
SELECT
  TO_CHAR(order_date, 'YYYY-MM-DD'),
  TO_CHAR(order_date, 'Month DD, YYYY'),        -- 'January  15, 2024'
  TO_CHAR(order_date, 'FMMonth DD, YYYY'),      -- 'January 15, 2024' (FM = fill mode)
  TO_CHAR(amount, '999,999.00'),                -- Number formatting
  TO_DATE('2024-01-15', 'YYYY-MM-DD'),
  TO_TIMESTAMP('2024-01-15 10:30:00', 'YYYY-MM-DD HH24:MI:SS')
FROM DUAL
```

**Critical**: Oracle uses `TRUNC` for date truncation, not `DATE_TRUNC`. Use `TO_CHAR` and `TO_DATE` for formatting.

## Type Casting

```sql
-- CAST syntax
SELECT CAST('123' AS NUMBER)
SELECT CAST('123.45' AS NUMBER(10,2))
SELECT CAST(123 AS VARCHAR2(10))
SELECT CAST(order_date AS TIMESTAMP)
SELECT CAST(ts AS DATE)

-- TO_ conversion functions (Oracle-specific, more control)
SELECT TO_NUMBER('123')
SELECT TO_NUMBER('1,234.56', '9,999.99')        -- With format mask
SELECT TO_CHAR(123, '00000')                    -- '00123'
SELECT TO_DATE('2024-01-15', 'YYYY-MM-DD')
SELECT TO_TIMESTAMP('2024-01-15 10:30', 'YYYY-MM-DD HH24:MI')

-- Type names: NUMBER, NUMBER(p,s), VARCHAR2(n), CHAR(n), CLOB,
--             DATE, TIMESTAMP, TIMESTAMP WITH TIME ZONE, INTERVAL,
--             RAW, BLOB, XMLTYPE
```

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),    -- First non-null (standard)
  NVL(nullable_col, 'default'),         -- Oracle-specific, two args
  NVL2(col, 'not_null_val', 'null_val'),-- If col IS NOT NULL then 2nd else 3rd
  NULLIF(col, ''),                      -- Returns NULL if col = ''
  LNNVL(condition),                     -- True if condition is FALSE or NULL
  DECODE(col, NULL, 'is null', col)     -- NULL comparison in DECODE
FROM DUAL
```

**Important**: `NVL` is Oracle-specific. `NVL2` is powerful: `NVL2(x, a, b)` returns `a` if x is not null, `b` if null.

## JSON Handling (Oracle 12c+)

```sql
-- Extract from JSON
SELECT
  JSON_VALUE(json_col, '$.key'),                -- Scalar value
  JSON_VALUE(json_col, '$.key' RETURNING NUMBER),
  JSON_QUERY(json_col, '$.object'),             -- Object/array as JSON
  JSON_VALUE(json_col, '$.items[0].name'),      -- Array access (0-indexed)
  JSON_EXISTS(json_col, '$.key')                -- Returns true/false

-- JSON_TABLE: parse JSON to rows (powerful!)
SELECT jt.*
FROM t,
JSON_TABLE(t.json_col, '$.items[*]'
  COLUMNS (
    id NUMBER PATH '$.id',
    name VARCHAR2(100) PATH '$.name',
    nested_val VARCHAR2(50) PATH '$.nested.field'
  )
) jt

-- Build JSON
SELECT JSON_OBJECT('id' VALUE id, 'name' VALUE name) FROM t
SELECT JSON_ARRAY(1, 2, 3) FROM DUAL
SELECT JSON_OBJECTAGG(key VALUE val) FROM t
SELECT JSON_ARRAYAGG(val ORDER BY val) FROM t

-- JSON condition in WHERE
SELECT * FROM t WHERE JSON_EXISTS(json_col, '$.status?(@ == "active")')
```

## Analytic (Window) Functions

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
  RATIO_TO_REPORT(amt) OVER (PARTITION BY cat)  -- Oracle-specific: percentage of total
FROM t
```

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amount), AVG(amount),
  MIN(val), MAX(val),
  LISTAGG(col, ', ') WITHIN GROUP (ORDER BY col),  -- String aggregation
  LISTAGG(DISTINCT col, ', ') WITHIN GROUP (ORDER BY col),  -- 19c+
  MEDIAN(amount),                                   -- Oracle-specific
  STATS_MODE(col)                                   -- Most frequent value
FROM t
GROUP BY category
```

## Subquery Factoring (CTEs)

```sql
-- Standard CTE
WITH active_users AS (
  SELECT * FROM users WHERE status = 'active'
)
SELECT * FROM active_users

-- Recursive CTE (11gR2+)
WITH subordinates (id, name, manager_id, depth) AS (
  SELECT id, name, manager_id, 1 FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id, s.depth + 1
  FROM employees e JOIN subordinates s ON e.manager_id = s.id
)
SELECT * FROM subordinates
```

## Row Limiting

```sql
-- FETCH FIRST (12c+, preferred)
SELECT * FROM orders ORDER BY order_date DESC
FETCH FIRST 10 ROWS ONLY

SELECT * FROM orders ORDER BY order_date DESC
OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY

-- ROWNUM (older syntax, applied before ORDER BY!)
SELECT * FROM (
  SELECT * FROM orders ORDER BY order_date DESC
) WHERE ROWNUM <= 10

-- ROW_NUMBER for pagination
SELECT * FROM (
  SELECT t.*, ROW_NUMBER() OVER (ORDER BY order_date DESC) rn FROM orders t
) WHERE rn BETWEEN 21 AND 30
```

**Critical**: `ROWNUM` is applied before `ORDER BY`. Always wrap ordered queries in subquery when using `ROWNUM`.

## MERGE (Upsert)

```sql
MERGE INTO target_table t
USING source_table s ON (t.id = s.id)
WHEN MATCHED THEN
  UPDATE SET t.name = s.name, t.updated_at = SYSDATE
WHEN NOT MATCHED THEN
  INSERT (id, name, created_at) VALUES (s.id, s.name, SYSDATE)
```

## Common Patterns

### Safe Division
```sql
SELECT
  NULLIF(denominator, 0),
  numerator / NULLIF(denominator, 0),
  CASE WHEN denominator = 0 THEN NULL ELSE numerator / denominator END
FROM DUAL
```

### DECODE Function (Oracle-specific CASE)
```sql
SELECT DECODE(status,
  'A', 'Active',
  'I', 'Inactive',
  'P', 'Pending',
  'Unknown'  -- Default
) FROM t

-- DECODE handles NULL comparison (unlike CASE)
SELECT DECODE(col, NULL, 'is null', 'not null') FROM t
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
  SELECT t.*, ROW_NUMBER() OVER (PARTITION BY category ORDER BY updated_at DESC) rn
  FROM products t
) WHERE rn = 1

-- Using KEEP FIRST (Oracle-specific)
SELECT category,
  MAX(name) KEEP (DENSE_RANK FIRST ORDER BY updated_at DESC) AS latest_name,
  MAX(price) KEEP (DENSE_RANK FIRST ORDER BY updated_at DESC) AS latest_price
FROM products
GROUP BY category
```

### Generate Series / Date Range
```sql
-- Using CONNECT BY
SELECT LEVEL AS n FROM DUAL CONNECT BY LEVEL <= 100

SELECT DATE '2024-01-01' + LEVEL - 1 AS dt
FROM DUAL
CONNECT BY LEVEL <= 365

-- Using recursive CTE (11gR2+)
WITH dates (dt) AS (
  SELECT DATE '2024-01-01' FROM DUAL
  UNION ALL
  SELECT dt + 1 FROM dates WHERE dt < DATE '2024-12-31'
)
SELECT * FROM dates
```

### Hierarchical Queries (CONNECT BY)
```sql
SELECT id, name, LEVEL, SYS_CONNECT_BY_PATH(name, '/') AS path
FROM employees
START WITH manager_id IS NULL
CONNECT BY PRIOR id = manager_id
ORDER SIBLINGS BY name
```

## Key Differences from Other Dialects

| Feature | Oracle | PostgreSQL | MySQL | SQL Server |
|---------|--------|------------|-------|------------|
| Identifier quotes | `"double"` | `"double"` | `` `backtick` `` | `[brackets]` |
| Concat | `\|\|` | `\|\|` | `CONCAT` | `+` |
| Date truncate | `TRUNC(d, 'MM')` | `DATE_TRUNC` | `DATE_FORMAT` | `DATETRUNC` |
| Date add | `d + INTERVAL '7' DAY` | `d + INTERVAL '7 days'` | `DATE_ADD` | `DATEADD` |
| Current date | `SYSDATE` | `CURRENT_DATE` | `NOW()` | `GETDATE()` |
| NULL function | `NVL` | `COALESCE` | `IFNULL` | `ISNULL` |
| String agg | `LISTAGG` | `STRING_AGG` | `GROUP_CONCAT` | `STRING_AGG` |
| Pagination | `FETCH FIRST` / `ROWNUM` | `LIMIT OFFSET` | `LIMIT OFFSET` | `TOP` / `OFFSET FETCH` |
| Empty query | `SELECT x FROM DUAL` | `SELECT x` | `SELECT x` | `SELECT x` |
| Upsert | `MERGE` | `ON CONFLICT` | `ON DUPLICATE KEY` | `MERGE` |
| Ternary | `DECODE` / `NVL2` | `CASE` | `IF` | `IIF` |
