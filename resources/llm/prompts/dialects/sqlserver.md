# SQL Server (T-SQL) Dialect - Key Differences

This guide covers only T-SQL-specific syntax that differs from standard SQL.

## Identifier Quoting

**CRITICAL: SQL Server uses square brackets for identifiers.**

| Syntax | Meaning |
|--------|---------|
| `[Name]` | Identifier (column, table) |
| `'text'` | String literal |

```sql
SELECT [Column Name], [select], [order] FROM [My Table]
```

Double quotes also work if `QUOTED_IDENTIFIER` is ON (default).

**Schema-qualified names:** Database, schema, and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM [MyDatabase].[dbo].[My Table]
SELECT * FROM dbo.orders                  -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM [dbo.orders]                -- Looks for table literally named "dbo.orders"
```

## No LIMIT - Use TOP or OFFSET FETCH

**CRITICAL: SQL Server has no `LIMIT` clause.**

```sql
-- First N rows
SELECT TOP 10 * FROM orders ORDER BY order_date DESC
SELECT TOP 10 PERCENT * FROM orders

-- Pagination (SQL 2012+, requires ORDER BY)
SELECT * FROM orders
ORDER BY order_date DESC
OFFSET 20 ROWS
FETCH NEXT 10 ROWS ONLY
```

## String Concatenation

`+` operator propagates NULL. Use `CONCAT()` for NULL-safety:

```sql
SELECT first_name + ' ' + last_name               -- NULL if any part is NULL!
SELECT CONCAT(first_name, ' ', last_name)         -- NULL becomes empty string
SELECT CONCAT_WS(' ', first_name, middle, last)   -- With separator (SQL 2017+)
```

## IIF for Ternary (Not IF)

```sql
SELECT IIF(status = 'active', 'Yes', 'No')        -- SQL 2012+
SELECT CASE WHEN status = 'active' THEN 'Yes' ELSE 'No' END
```

## DATETRUNC is 2022+ Only

For older versions, use workarounds:

```sql
-- SQL Server 2022+
SELECT DATETRUNC(month, order_date)

-- Older versions
SELECT CAST(order_date AS DATE)                                    -- To day
SELECT DATEFROMPARTS(YEAR(order_date), MONTH(order_date), 1)       -- To month
SELECT DATEFROMPARTS(YEAR(order_date), 1, 1)                       -- To year
```

## Date Functions

```sql
SELECT GETDATE()                                  -- Current timestamp
SELECT DATEADD(day, 7, order_date)                -- Add interval
SELECT DATEDIFF(day, start_date, end_date)        -- Difference
SELECT YEAR(dt), MONTH(dt), DAY(dt)               -- Extract parts
SELECT DATEPART(weekday, dt)                      -- 1=Sunday (depends on DATEFIRST)
SELECT DATENAME(month, dt)                        -- 'January'

-- Formatting with style codes
SELECT CONVERT(VARCHAR, order_date, 23)           -- 'YYYY-MM-DD' (style 23)
SELECT FORMAT(order_date, 'yyyy-MM-dd')           -- .NET format strings
```

## LEN Not LENGTH

```sql
SELECT LEN(name)                                  -- Character count (excludes trailing spaces)
SELECT DATALENGTH(name)                           -- Byte count
```

## NULL Handling

```sql
SELECT ISNULL(nullable, 'default')                -- Two-arg only (T-SQL specific)
SELECT COALESCE(a, b, c)                          -- Multiple args (standard)
SELECT NULLIF(col, '')
```

## TRY_CAST / TRY_CONVERT

Returns NULL on failure instead of error:

```sql
SELECT TRY_CAST('invalid' AS INT)                 -- Returns NULL
SELECT TRY_CONVERT(INT, 'invalid')                -- Returns NULL
```

## String Aggregation (SQL 2017+)

```sql
SELECT STRING_AGG(name, ', ')
FROM t GROUP BY category

SELECT STRING_AGG(name, ', ') WITHIN GROUP (ORDER BY name)
FROM t GROUP BY category
```

## STRING_SPLIT Returns Table

```sql
SELECT value FROM STRING_SPLIT('a,b,c', ',')      -- Returns table, not array
```

## JSON Functions

```sql
SELECT JSON_VALUE(json_col, '$.key')              -- Scalar as NVARCHAR
SELECT JSON_QUERY(json_col, '$.object')           -- Object/array as JSON string
SELECT JSON_VALUE(json_col, '$.items[0].name')    -- Nested access
SELECT ISJSON(json_col)                           -- Returns 1 or 0

-- Parse JSON to rows
SELECT * FROM OPENJSON(json_col, '$.items')
  WITH (id INT '$.id', name NVARCHAR(100) '$.name')
```

## CROSS APPLY (SQL Server's LATERAL)

```sql
SELECT u.*, recent.*
FROM users u
CROSS APPLY (
  SELECT TOP 3 * FROM orders WHERE user_id = u.id ORDER BY created_at DESC
) recent
```

## MERGE for Upsert

```sql
MERGE INTO target_table AS t
USING source_table AS s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET t.name = s.name
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);
```

## No QUALIFY - Use Subquery

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) AS rn
  FROM sales
) t WHERE rn = 1
```

## CHARINDEX for Substring Position

```sql
SELECT CHARINDEX('search', name)                  -- 1-indexed, 0 if not found
SELECT PATINDEX('%pattern%', name)                -- Pattern matching
```
