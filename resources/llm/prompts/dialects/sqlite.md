# SQLite Dialect - Key Differences

SQLite is a lightweight embedded database with unique constraints.

## Critical Limitations

- **No RIGHT JOIN or FULL OUTER JOIN** - use reversed LEFT JOIN
- **No native BOOLEAN** - uses INTEGER (0=false, 1=true)
- **Dynamic typing** - columns can store any type

## Identifier Quoting

Double quotes or backticks both work:

```sql
SELECT "Column Name", `select` FROM "My Table"
```

**Schema-qualified names:** When using attached databases, database and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "attached_db"."My Table"
SELECT * FROM main.orders                 -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "main.orders"               -- Looks for table literally named "main.orders"
```

## LIKE vs GLOB

```sql
SELECT * FROM t WHERE name LIKE 'A%'    -- Case-INSENSITIVE for ASCII!
SELECT * FROM t WHERE name GLOB 'A*'    -- Case-sensitive, uses * and ?
```

## No DATE_TRUNC - Use Date Modifiers

```sql
SELECT DATE(order_date)                           -- Truncate to date
SELECT DATE(order_date, 'start of month')         -- To month
SELECT DATE(order_date, 'start of year')          -- To year
SELECT DATE(order_date, 'weekday 0', '-7 days')   -- To week (Sunday)
```

## Date Arithmetic with Modifiers

```sql
SELECT DATE(order_date, '+7 days')
SELECT DATE(order_date, '-1 month')
SELECT DATE(order_date, '+1 year', '-1 day')      -- Chain modifiers
SELECT DATETIME(ts, '+2 hours', '+30 minutes')
```

## No DATEDIFF - Use JULIANDAY

```sql
SELECT JULIANDAY(end_date) - JULIANDAY(start_date) AS days_diff
SELECT CAST((JULIANDAY(end_date) - JULIANDAY(start_date)) AS INTEGER)
```

## Date Extraction with STRFTIME

```sql
SELECT STRFTIME('%Y', order_date) AS year         -- Returns TEXT '2024'
SELECT STRFTIME('%m', order_date) AS month        -- '01'
SELECT STRFTIME('%w', order_date) AS dow          -- 0=Sunday, 6=Saturday
SELECT STRFTIME('%s', 'now') AS unix_timestamp
```

## Current Date/Time

```sql
SELECT DATE('now')                                -- 'YYYY-MM-DD'
SELECT DATETIME('now')                            -- 'YYYY-MM-DD HH:MM:SS'
SELECT DATETIME('now', 'localtime')               -- Local timezone
```

## String Aggregation (GROUP_CONCAT)

```sql
SELECT GROUP_CONCAT(name) FROM t GROUP BY category
SELECT GROUP_CONCAT(name, '; ') FROM t GROUP BY category    -- Custom separator
SELECT GROUP_CONCAT(DISTINCT name) FROM t GROUP BY category
```

## TOTAL vs SUM

```sql
SELECT SUM(amount)    -- Returns NULL for empty set
SELECT TOTAL(amount)  -- Returns 0.0 for empty set
```

## IIF for Ternary (3.32+)

```sql
SELECT IIF(status = 'active', 'Yes', 'No')
SELECT IIF(col IS NULL, 'N/A', col)
```

## JSON Operators (3.38+)

```sql
SELECT JSON_EXTRACT(json_col, '$.key')
SELECT json_col -> '$.key'                -- Returns JSON
SELECT json_col ->> '$.key'               -- Returns TEXT
SELECT JSON_EXTRACT(json_col, '$.items[0]')
```

## Upsert (3.24+)

```sql
INSERT INTO t (id, name, count) VALUES (1, 'foo', 1)
ON CONFLICT(id) DO UPDATE SET count = count + 1, name = excluded.name

INSERT OR REPLACE INTO t (id, name) VALUES (1, 'new')   -- Replace on conflict
INSERT OR IGNORE INTO t (id, name) VALUES (1, 'foo')    -- Skip on conflict
```

## Boolean Handling

```sql
SELECT * FROM t WHERE active = 1          -- Explicit check
SELECT * FROM t WHERE active              -- Truthy (non-zero)
SELECT * FROM t WHERE NOT active          -- Falsy (zero or NULL)
```

## No RIGHT JOIN - Reverse It

```sql
-- Instead of: SELECT * FROM a RIGHT JOIN b ON a.id = b.id
SELECT * FROM b LEFT JOIN a ON a.id = b.id
```

## Date Series with Recursive CTE

```sql
WITH RECURSIVE dates(dt) AS (
  SELECT '2024-01-01'
  UNION ALL
  SELECT DATE(dt, '+1 day') FROM dates WHERE dt < '2024-12-31'
)
SELECT * FROM dates
```

## No QUALIFY - Use Subquery

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY updated_at DESC) AS rn
  FROM products
) WHERE rn = 1
```
