# PostgreSQL Dialect - Key Differences

PostgreSQL is highly standards-compliant. This guide covers only PostgreSQL-specific syntax that differs from standard SQL.

## Identifier Quoting

**CRITICAL: PostgreSQL uses double quotes for identifiers and lowercases unquoted identifiers.**

| Syntax | Meaning |
|--------|---------|
| `"Name"` | Identifier (preserves case) |
| `'text'` | String literal |

```sql
-- Unquoted identifiers are LOWERCASED
SELECT MyColumn FROM t    -- Actually selects "mycolumn"

-- Use double quotes to preserve case or for reserved words
SELECT "MyColumn", "order" FROM "My Table"
```

Use double quotes for: mixed-case names, reserved words, special characters, spaces.

**Schema-qualified names:** Schema and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "MySchema"."MyTable"
SELECT * FROM public.orders           -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "public.orders"         -- Looks for table literally named "public.orders"
```

## Type Casting Shorthand

PostgreSQL's `::` operator is concise alternative to `CAST()`:

```sql
SELECT '123'::INTEGER, '2024-01-15'::DATE, amount::TEXT
SELECT CAST('123' AS INTEGER)  -- Standard syntax also works
```

## Case-Insensitive Matching (ILIKE)

PostgreSQL-specific operator for case-insensitive pattern matching:

```sql
SELECT * FROM t WHERE name ILIKE 'john%'     -- Case-insensitive
SELECT * FROM t WHERE name LIKE 'John%'      -- Case-sensitive (standard)

-- POSIX regex operators
SELECT * FROM t WHERE name ~ '^[A-Z]'        -- Case-sensitive regex
SELECT * FROM t WHERE name ~* '^[a-z]'       -- Case-insensitive regex
```

## DISTINCT ON (First Row Per Group)

PostgreSQL-specific clause - cleaner than window functions for "first row per group":

```sql
-- Get most recent order per customer
SELECT DISTINCT ON (customer_id) *
FROM orders
ORDER BY customer_id, created_at DESC
```

**Important**: `ORDER BY` must start with the `DISTINCT ON` columns.

## Arrays (1-Indexed)

PostgreSQL arrays are **1-indexed**, unlike BigQuery (0-indexed).

```sql
-- Array access
SELECT my_array[1] AS first_element          -- 1-indexed!

-- Array operators
SELECT arr @> ARRAY[1, 2]                    -- Contains
SELECT arr && ARRAY[1, 2]                    -- Overlaps
SELECT value = ANY(arr)                      -- Membership test

-- Flatten to rows
SELECT id, elem FROM t, UNNEST(t.arr) AS elem

-- Aggregation
SELECT ARRAY_AGG(col ORDER BY sort_col) FROM t
```

## JSON/JSONB Operators

PostgreSQL uses arrow operators (not function syntax like BigQuery):

```sql
-- Extraction (-> returns JSON, ->> returns TEXT)
SELECT json_col -> 'key'                     -- Returns JSON
SELECT json_col ->> 'key'                    -- Returns TEXT
SELECT json_col -> 0                         -- Array access
SELECT json_col #>> '{nested,path}'          -- Path extraction as TEXT

-- JSONB-only operators
SELECT json_col @> '{"key": "value"}'        -- Contains
SELECT json_col ? 'key'                      -- Has key
SELECT json_col ?| ARRAY['a', 'b']           -- Has any key
SELECT json_col ?& ARRAY['a', 'b']           -- Has all keys
```

## FILTER Clause (Conditional Aggregation)

PostgreSQL-specific clause - cleaner than CASE WHEN:

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'active') AS active_count,
  SUM(amount) FILTER (WHERE type = 'revenue') AS revenue
FROM t
```

## NULL-Safe Comparison

```sql
SELECT * FROM t WHERE col IS DISTINCT FROM other_col      -- NULL-safe <>
SELECT * FROM t WHERE col IS NOT DISTINCT FROM other_col  -- NULL-safe =
```

## RETURNING Clause

Get affected rows from write operations:

```sql
INSERT INTO t (col) VALUES ('val') RETURNING *
UPDATE t SET col = 'new' WHERE id = 1 RETURNING id, col
DELETE FROM t WHERE id = 1 RETURNING *
```

## Upsert with ON CONFLICT

```sql
INSERT INTO t (id, name, count)
VALUES (1, 'foo', 1)
ON CONFLICT (id) DO UPDATE SET count = t.count + 1
-- Or: ON CONFLICT DO NOTHING
```

## GENERATE_SERIES

Generate sequences of numbers or dates:

```sql
SELECT GENERATE_SERIES(1, 10)
SELECT GENERATE_SERIES(1, 10, 2)              -- Step of 2
SELECT GENERATE_SERIES('2024-01-01'::DATE, '2024-12-31'::DATE, '1 month')
```

## LATERAL Joins

Correlated subquery in FROM clause:

```sql
SELECT u.*, recent.*
FROM users u,
LATERAL (
  SELECT * FROM orders WHERE user_id = u.id ORDER BY created_at DESC LIMIT 3
) AS recent
```

## String Concatenation

```sql
SELECT first_name || ' ' || last_name        -- Use || operator
SELECT SPLIT_PART(csv, ',', 1)               -- Extract nth element (1-indexed)
```

## Date Truncation

```sql
SELECT DATE_TRUNC('month', order_date)       -- year, quarter, month, week, day, hour
SELECT DATE_TRUNC('week', order_date)        -- Truncates to Monday
```
