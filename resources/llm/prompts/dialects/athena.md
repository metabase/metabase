# Athena (Trino/Presto) Dialect - Key Differences

Athena uses **Trino** (formerly PrestoSQL) as its query engine.

## Identifier Quoting

Double quotes for identifiers. Case-insensitive (stored as lowercase).

```sql
SELECT "my-column", "order" FROM my_table
```

**Schema-qualified names:** Database and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "my-database"."my-table"
SELECT * FROM my_database.my_table        -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "my_database.my_table"      -- Looks for table literally named "my_database.my_table"
```

## DATE_ADD / DATE_DIFF Syntax

**Unit comes first**, unlike most databases:

```sql
SELECT DATE_ADD('day', 7, order_date)              -- Add 7 days
SELECT DATE_ADD('month', -1, order_date)           -- Subtract 1 month
SELECT DATE_DIFF('day', start_date, end_date)      -- Difference in days
```

## No IFNULL or NVL

```sql
SELECT COALESCE(nullable, 'default')               -- Use COALESCE
SELECT IF(col IS NULL, 'N/A', col)                 -- Or IF function
```

## IF Function for Ternary

```sql
SELECT IF(status = 'active', 'Yes', 'No')
SELECT IF(amount > 100, 'high', 'low')
```

## Arrays (1-Indexed)

```sql
SELECT my_array[1] AS first_element                -- 1-indexed!
SELECT CARDINALITY(my_array)                       -- Length
SELECT CONTAINS(my_array, 'value')                 -- Membership
SELECT ARRAY_JOIN(my_array, ', ')                  -- Join to string

-- Flatten array to rows
SELECT t.id, u.element
FROM my_table t
CROSS JOIN UNNEST(t.array_column) AS u(element)

-- With index
CROSS JOIN UNNEST(t.array_column) WITH ORDINALITY AS u(element, idx)
```

## TRY_CAST for Safe Casting

```sql
SELECT TRY_CAST(potentially_bad AS INTEGER)        -- NULL on failure
SELECT CAST(col AS BIGINT)                         -- Throws on failure
```

## JSON Functions

```sql
SELECT JSON_EXTRACT(json_col, '$.field')           -- Returns JSON type
SELECT JSON_EXTRACT_SCALAR(json_col, '$.field')    -- Returns VARCHAR
SELECT CAST(JSON_EXTRACT(json_col, '$.count') AS INTEGER)
```

## APPROX_DISTINCT

```sql
SELECT APPROX_DISTINCT(user_id)                    -- Fast approximate count
SELECT APPROX_PERCENTILE(amount, 0.5)              -- Approximate median
```

## Date Spine with SEQUENCE

```sql
SELECT dt
FROM UNNEST(SEQUENCE(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1' DAY)) AS t(dt)
```

## Maps

```sql
SELECT MAP(ARRAY['a', 'b'], ARRAY[1, 2])
SELECT my_map['key']
SELECT ELEMENT_AT(my_map, 'key')                   -- NULL-safe access
SELECT MAP_KEYS(my_map), MAP_VALUES(my_map)
```

## Read-Only Limitations

- **No UPDATE/DELETE** on standard tables
- **No transactions** (each query is atomic)
- 30-minute query timeout, 2GB result limit

## No QUALIFY - Use Subquery

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) AS rn
  FROM sales
) WHERE rn = 1
```
