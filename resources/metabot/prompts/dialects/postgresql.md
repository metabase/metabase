# PostgreSQL SQL Dialect Instructions

PostgreSQL is a standards-compliant relational database with rich feature support. Follow these dialect-specific rules.

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
  SUBSTRING(name FROM 1 FOR 3),           -- 1-indexed
  LENGTH(name), CHAR_LENGTH(name),
  REPLACE(name, 'old', 'new'),
  SPLIT_PART(csv, ',', 1),                -- Extract nth element (1-indexed)
  STRING_TO_ARRAY(csv, ','),              -- Split to array
  POSITION('sub' IN name),                -- Find substring position
  LEFT(name, 3), RIGHT(name, 3),
  LPAD(num::TEXT, 5, '0'), RPAD(name, 10, ' ')

-- Pattern matching (PostgreSQL-specific)
SELECT * FROM t WHERE name LIKE 'A%'      -- Case-sensitive
SELECT * FROM t WHERE name ILIKE 'a%'     -- Case-insensitive (PG-specific!)
SELECT * FROM t WHERE name ~ '^[A-Z]'     -- POSIX regex match
SELECT * FROM t WHERE name ~* '^[a-z]'    -- Case-insensitive regex
SELECT REGEXP_REPLACE(text, 'pattern', 'replacement', 'g')
```

**Important**: `ILIKE` for case-insensitive matching is PostgreSQL-specific; other databases use `LOWER()` workarounds.

## Date and Time

```sql
-- Current date/time
SELECT
  CURRENT_DATE,                           -- DATE (no parens needed)
  CURRENT_TIMESTAMP,                      -- TIMESTAMP WITH TIME ZONE
  NOW(),                                  -- Same as CURRENT_TIMESTAMP
  LOCALTIME, LOCALTIMESTAMP               -- Without timezone

-- Date truncation
SELECT DATE_TRUNC('month', order_date)    -- year, quarter, month, week, day, hour, minute, second
SELECT DATE_TRUNC('week', order_date)     -- Truncates to Monday

-- Date arithmetic with INTERVAL
SELECT
  order_date + INTERVAL '7 days',
  order_date - INTERVAL '1 month',
  order_date + INTERVAL '2 hours 30 minutes',
  order_date + 7                          -- Add integer days directly

-- Date difference
SELECT
  end_date - start_date,                  -- Returns INTERVAL
  AGE(end_date, start_date),              -- Returns INTERVAL with year/month/day
  EXTRACT(EPOCH FROM (end_date - start_date)) / 86400 AS days  -- Numeric days

-- Extraction
SELECT
  EXTRACT(YEAR FROM order_date),          -- Or: DATE_PART('year', order_date)
  EXTRACT(MONTH FROM order_date),
  EXTRACT(DOW FROM order_date),           -- 0=Sunday, 6=Saturday
  EXTRACT(ISODOW FROM order_date),        -- 1=Monday, 7=Sunday
  EXTRACT(EPOCH FROM timestamp_col)       -- Unix timestamp

-- Formatting and parsing
SELECT
  TO_CHAR(order_date, 'YYYY-MM-DD'),
  TO_CHAR(order_date, 'Mon DD, YYYY'),
  TO_CHAR(amount, '999,999.00'),          -- Number formatting too!
  TO_DATE('2024-01-15', 'YYYY-MM-DD'),
  TO_TIMESTAMP('2024-01-15 10:30:00', 'YYYY-MM-DD HH24:MI:SS')
```

## Type Casting

```sql
-- PostgreSQL shorthand (preferred, concise)
SELECT '123'::INTEGER, '2024-01-15'::DATE, 123::TEXT

-- Standard CAST
SELECT CAST('123' AS INTEGER), CAST(order_date AS TEXT)

-- Type names: INTEGER, BIGINT, SMALLINT, NUMERIC, DECIMAL, REAL, DOUBLE PRECISION,
--             TEXT, VARCHAR(n), CHAR(n), BOOLEAN, DATE, TIME, TIMESTAMP,
--             TIMESTAMPTZ, INTERVAL, UUID, JSON, JSONB, BYTEA, ARRAY
```

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),      -- First non-null value
  NULLIF(col, ''),                        -- Returns NULL if col = ''
  col IS DISTINCT FROM other_col,         -- NULL-safe inequality
  col IS NOT DISTINCT FROM other_col      -- NULL-safe equality
```

**Important**: `IS DISTINCT FROM` treats NULL as a comparable value, unlike `=` or `<>`.

## Arrays

```sql
-- Array literal
SELECT ARRAY[1, 2, 3], '{1,2,3}'::INT[]

-- Array access (1-indexed!)
SELECT my_array[1] AS first_element

-- Array functions
SELECT
  ARRAY_LENGTH(arr, 1),                   -- Length of first dimension
  CARDINALITY(arr),                       -- Total elements
  ARRAY_CAT(arr1, arr2),                  -- Concatenate arrays
  ARRAY_APPEND(arr, element),
  ARRAY_PREPEND(element, arr),
  ARRAY_TO_STRING(arr, ', '),             -- Join to string
  ARRAY_POSITION(arr, value),             -- Find index of value
  ARRAY_REMOVE(arr, value),
  value = ANY(arr),                       -- Membership test
  arr @> ARRAY[1, 2],                     -- Contains
  arr && ARRAY[1, 2]                      -- Overlaps

-- UNNEST: flatten array to rows
SELECT UNNEST(ARRAY[1, 2, 3])
SELECT t.id, u.element FROM t, UNNEST(t.arr) AS u(element)

-- Array aggregation
SELECT category, ARRAY_AGG(product ORDER BY name) FROM t GROUP BY category
SELECT ARRAY_AGG(DISTINCT val) FROM t
```

**Critical**: PostgreSQL arrays are **1-indexed**, unlike BigQuery's 0-indexed arrays.

## JSON/JSONB

PostgreSQL has two JSON types: `JSON` (text storage) and `JSONB` (binary, indexed, preferred).

```sql
-- Extract from JSON/JSONB
SELECT
  json_col -> 'key',                      -- Returns JSON/JSONB
  json_col ->> 'key',                     -- Returns TEXT
  json_col -> 0,                          -- Array access by index
  json_col #> '{nested,path}',            -- Path extraction as JSON
  json_col #>> '{nested,path}',           -- Path extraction as TEXT
  json_col @> '{"key": "value"}',         -- Contains (JSONB only)
  json_col ? 'key',                       -- Has key (JSONB only)
  json_col ?| ARRAY['key1', 'key2'],      -- Has any key
  json_col ?& ARRAY['key1', 'key2']       -- Has all keys

-- JSON functions
SELECT
  JSONB_EXTRACT_PATH(json_col, 'a', 'b'), -- Same as #>
  JSONB_EXTRACT_PATH_TEXT(json_col, 'a'), -- Same as #>>
  JSONB_ARRAY_ELEMENTS(json_col),         -- Expand array to rows
  JSONB_ARRAY_LENGTH(json_col),
  JSONB_OBJECT_KEYS(json_col),            -- Get keys as rows
  JSONB_EACH(json_col),                   -- Key-value pairs as rows
  JSONB_BUILD_OBJECT('a', 1, 'b', 2),     -- Build JSON object
  JSONB_AGG(val),                         -- Aggregate to JSON array
  JSONB_OBJECT_AGG(key, val)              -- Aggregate to JSON object

-- JSONB modification (JSONB only)
SELECT
  json_col || '{"new": "value"}',         -- Merge
  json_col - 'key',                       -- Remove key
  json_col #- '{nested,path}'             -- Remove at path
```

## Window Functions

```sql
SELECT
  ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC),
  RANK() OVER w, DENSE_RANK() OVER w,     -- Named window
  SUM(amt) OVER (PARTITION BY cat),
  LAG(amt, 1, 0) OVER (ORDER BY dt),      -- With default value
  LEAD(amt) OVER (ORDER BY dt),
  FIRST_VALUE(amt) OVER w, LAST_VALUE(amt) OVER w,
  NTH_VALUE(amt, 2) OVER w,
  NTILE(4) OVER (ORDER BY amt),           -- Quartiles
  PERCENT_RANK() OVER w, CUME_DIST() OVER w
FROM t
WINDOW w AS (PARTITION BY cat ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
```

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amount), AVG(amount),
  MIN(val), MAX(val),
  ARRAY_AGG(col ORDER BY sort_col),
  STRING_AGG(col, ', ' ORDER BY sort_col),
  BOOL_AND(flag), BOOL_OR(flag),
  -- FILTER clause (PostgreSQL-specific!)
  COUNT(*) FILTER (WHERE status = 'active') AS active_count,
  SUM(amount) FILTER (WHERE type = 'revenue') AS revenue
FROM t GROUP BY category
```

**Important**: `FILTER` clause is cleaner than `CASE WHEN` for conditional aggregation.

## Common Table Expressions (CTEs)

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
```

## Common Patterns

### DISTINCT ON (PostgreSQL-specific)
```sql
-- Get first row per group (much cleaner than window functions!)
SELECT DISTINCT ON (category) *
FROM products
ORDER BY category, updated_at DESC
```

### RETURNING Clause
```sql
-- Return affected rows from INSERT/UPDATE/DELETE
INSERT INTO t (col) VALUES ('val') RETURNING *
UPDATE t SET col = 'new' WHERE id = 1 RETURNING id, col
DELETE FROM t WHERE id = 1 RETURNING *
```

### Upsert with ON CONFLICT
```sql
INSERT INTO t (id, name, count)
VALUES (1, 'foo', 1)
ON CONFLICT (id) DO UPDATE SET count = t.count + 1
-- Or: ON CONFLICT DO NOTHING
```

### Safe Division
```sql
SELECT NULLIF(denominator, 0) AS safe_denom,
       numerator / NULLIF(denominator, 0)
```

### Generate Series
```sql
-- Number series
SELECT GENERATE_SERIES(1, 10)
SELECT GENERATE_SERIES(1, 10, 2)          -- Step of 2

-- Date series
SELECT GENERATE_SERIES('2024-01-01'::DATE, '2024-12-31'::DATE, '1 month')
```

### Lateral Joins
```sql
-- Correlated subquery in FROM (powerful!)
SELECT u.*, recent.*
FROM users u,
LATERAL (
  SELECT * FROM orders WHERE user_id = u.id ORDER BY created_at DESC LIMIT 3
) AS recent
```

## Key Differences from Other Dialects

| Feature | PostgreSQL | BigQuery | MySQL | Snowflake |
|---------|------------|----------|-------|-----------|
| Identifier quotes | `"double"` | `` `backtick` `` | `` `backtick` `` | `"double"` |
| Concat | `\|\|` | `\|\|` or `CONCAT` | `CONCAT` | `\|\|` |
| Case-insensitive LIKE | `ILIKE` | `LOWER()` workaround | `LIKE` (default) | `ILIKE` |
| Array index | 1-based | 0-based | N/A | 0-based |
| Date truncate | `DATE_TRUNC('month', d)` | `DATE_TRUNC(d, MONTH)` | `DATE_FORMAT` | `DATE_TRUNC` |
| JSON access | `->`, `->>` | `JSON_VALUE` | `->`, `->>` | `:` path notation |
| Filter aggregate | `FILTER (WHERE)` | `COUNTIF` | `CASE WHEN` | `IFF` |
| First per group | `DISTINCT ON` | `QUALIFY` | window function | `QUALIFY` |
| Upsert | `ON CONFLICT` | `MERGE` | `ON DUPLICATE KEY` | `MERGE` |
