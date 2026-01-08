# MySQL Dialect - Key Differences

MySQL 8.0+ syntax. This guide covers only MySQL-specific syntax that differs from standard SQL.

## Identifier Quoting

**CRITICAL: MySQL uses backticks for identifiers.**

| Syntax | Meaning |
|--------|---------|
| `` `name` `` | Identifier (column, table) |
| `'text'` | String literal |

```sql
SELECT `select`, `order` FROM `my-table`
```

Use backticks for: reserved words, hyphens, special characters.

**Schema-qualified names:** Database and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM `my-database`.`my-table`
SELECT * FROM my_database.my_table        -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM `my_database.my_table`      -- Looks for table literally named "my_database.my_table"
```

## String Concatenation

**CRITICAL: The `||` operator does NOT work in MySQL. Use CONCAT().**

```sql
-- CORRECT
SELECT CONCAT(first_name, ' ', last_name) AS full_name
SELECT CONCAT_WS(' ', first_name, middle, last_name)  -- With separator, skips NULLs

-- WRONG: This does NOT concatenate in MySQL!
SELECT first_name || ' ' || last_name
```

## Case-Insensitive by Default

**MySQL string comparisons are case-insensitive by default** (depends on collation).

```sql
SELECT * FROM t WHERE name LIKE 'john%'        -- Matches 'John', 'JOHN', etc.
SELECT * FROM t WHERE name LIKE BINARY 'John%' -- Force case-sensitive
SELECT * FROM t WHERE name REGEXP '^[A-Z]'     -- Regex (also case-insensitive by default)
```

## No DATE_TRUNC

MySQL lacks `DATE_TRUNC`. Use `DATE_FORMAT` or `DATE()`:

```sql
-- Truncate to date
SELECT DATE(order_datetime)

-- Truncate to month
SELECT DATE_FORMAT(order_date, '%Y-%m-01')

-- Truncate to year
SELECT DATE_FORMAT(order_date, '%Y-01-01')

-- Truncate to week (Monday)
SELECT DATE(order_date - INTERVAL (WEEKDAY(order_date)) DAY)
```

## Date Differences

```sql
SELECT DATEDIFF(end_date, start_date)                    -- Days only (integer)
SELECT TIMESTAMPDIFF(MONTH, start_date, end_date)        -- YEAR, MONTH, DAY, HOUR, MINUTE, SECOND
SELECT TIMESTAMPDIFF(HOUR, start_datetime, end_datetime)
```

## Type Casting

**MySQL uses SIGNED/UNSIGNED instead of INTEGER in CAST.**

```sql
SELECT CAST(string_col AS SIGNED)           -- Integer
SELECT CAST(string_col AS UNSIGNED)         -- Unsigned integer
SELECT CAST(string_col AS DECIMAL(10,2))
SELECT CAST(string_col AS CHAR)
SELECT CAST(string_col AS DATE)

-- Implicit conversion tricks
SELECT string_col + 0                       -- String to number
SELECT CONCAT('', number_col)               -- Number to string
```

## String Aggregation (GROUP_CONCAT)

MySQL uses `GROUP_CONCAT` instead of `STRING_AGG`:

```sql
SELECT GROUP_CONCAT(name) FROM t GROUP BY category
SELECT GROUP_CONCAT(name ORDER BY name) FROM t GROUP BY category
SELECT GROUP_CONCAT(name SEPARATOR '; ') FROM t GROUP BY category
SELECT GROUP_CONCAT(DISTINCT name ORDER BY name) FROM t GROUP BY category
```

**Warning**: Default length limit is 1024 characters (`group_concat_max_len`). May silently truncate.

## SUBSTRING_INDEX (Delimiter Parsing)

MySQL-specific function to extract parts of delimited strings:

```sql
SELECT SUBSTRING_INDEX(csv, ',', 1)         -- First element (before 1st comma)
SELECT SUBSTRING_INDEX(csv, ',', 2)         -- Everything before 2nd comma
SELECT SUBSTRING_INDEX(csv, ',', -1)        -- Last element (after last comma)
SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(csv, ',', 2), ',', -1)  -- 2nd element
```

## Conditional Aggregation

MySQL booleans are 1/0, enabling arithmetic tricks:

```sql
SELECT
  SUM(status = 'active') AS active_count,           -- Boolean = 1 or 0
  SUM(IF(type = 'revenue', amount, 0)) AS revenue,
  COUNT(IF(region = 'US', 1, NULL)) AS us_count     -- COUNT ignores NULL
FROM t
```

## Integer Division

```sql
SELECT 10 DIV 3              -- Returns 3 (integer division)
SELECT 10 / 3                -- Returns 3.3333 (decimal)
SELECT 10 MOD 3, 10 % 3      -- Modulo (both work)
```

## JSON Path Syntax

MySQL uses `$.path` syntax:

```sql
SELECT json_col -> '$.key'                  -- Returns JSON
SELECT json_col ->> '$.key'                 -- Returns unquoted TEXT
SELECT JSON_EXTRACT(json_col, '$.key')      -- Same as ->
SELECT JSON_EXTRACT(json_col, '$.items[0]') -- Array access (0-indexed)
```

## NULL Handling

```sql
SELECT IFNULL(col, 'default')               -- MySQL-specific (2 args only)
SELECT COALESCE(col, 'default')             -- Standard (multiple args)
SELECT NULLIF(col, '')
```

## Upsert with ON DUPLICATE KEY

```sql
INSERT INTO t (id, name, count)
VALUES (1, 'foo', 1)
ON DUPLICATE KEY UPDATE count = count + 1, name = VALUES(name)
```

## LIMIT Syntax Variations

```sql
SELECT * FROM t LIMIT 10                    -- First 10 rows
SELECT * FROM t LIMIT 10 OFFSET 20          -- Skip 20, return 10
SELECT * FROM t LIMIT 20, 10                -- Alternative: offset, count
```

## No DISTINCT ON, No FILTER Clause

MySQL lacks PostgreSQL's `DISTINCT ON` and `FILTER`. Use window functions:

```sql
-- First row per group (MySQL 8.0+)
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY updated_at DESC) AS rn
  FROM products
) t WHERE rn = 1

-- Conditional aggregation (use IF instead of FILTER)
SELECT SUM(IF(status = 'active', amount, 0)) FROM t
```
