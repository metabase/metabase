# Redshift Dialect - Key Differences

Redshift is based on **PostgreSQL 8.0.2** with significant modifications. Many modern PostgreSQL features are missing.

## Identifier Quoting

Like PostgreSQL: double quotes for identifiers, unquoted names are lowercased.

```sql
SELECT "order", "group" FROM my_table     -- Reserved words need quotes
SELECT order_date FROM my_table           -- Unquoted: lowercased
```

**Schema-qualified names:** Schema and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "MySchema"."MyTable"
SELECT * FROM public.orders               -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "public.orders"             -- Looks for table literally named "public.orders"
```

## LEN Not LENGTH

```sql
SELECT LEN(name)                          -- CORRECT
SELECT LENGTH(name)                       -- WRONG: doesn't exist
```

## No IF/IFF - Use CASE or DECODE

```sql
-- No ternary function, use CASE
SELECT CASE WHEN status = 'active' THEN 'Yes' ELSE 'No' END

-- DECODE for switch/case style
SELECT DECODE(status, 'A', 'Active', 'I', 'Inactive', 'Unknown')

-- DECODE handles NULL specially
SELECT DECODE(col, NULL, 'N/A', col)
```

## No QUALIFY - Use Subquery

```sql
-- Must wrap in subquery to filter on window functions
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) AS rn
  FROM sales
) WHERE rn = 1
```

## JSON Functions (Verbose, No Operators)

Redshift has no JSON type or operator syntax. Uses verbose function names:

```sql
SELECT JSON_EXTRACT_PATH_TEXT(json_col, 'field')              -- Top-level
SELECT JSON_EXTRACT_PATH_TEXT(json_col, 'nested', 'field')    -- Nested (multiple args)
SELECT JSON_EXTRACT_ARRAY_ELEMENT_TEXT(json_col, 0)           -- Array element (0-indexed)
SELECT JSON_ARRAY_LENGTH(json_col)
SELECT IS_VALID_JSON(col)
```

## No TRY_CAST

Invalid casts raise errors. Validate data first or use CASE:

```sql
SELECT CASE WHEN col ~ '^[0-9]+$' THEN col::INTEGER ELSE NULL END
```

## GETDATE Not NOW

```sql
SELECT GETDATE()                          -- Current timestamp (preferred)
SELECT CURRENT_TIMESTAMP                  -- Also works
SELECT NOW()                              -- May not work as expected
```

## APPROXIMATE COUNT (Note the Space)

```sql
SELECT APPROXIMATE COUNT(DISTINCT user_id)    -- HyperLogLog estimate
-- Note: space between APPROXIMATE and COUNT
```

## NULL Handling

```sql
SELECT NVL(nullable, 'default')           -- Two-arg (like COALESCE)
SELECT NVL2(col, 'not null', 'is null')   -- Three-arg conditional
SELECT NULLIF(col, '')
-- No IFNULL(), use NVL() or COALESCE()
```

## String Aggregation (LISTAGG)

```sql
SELECT LISTAGG(name, ', ') WITHIN GROUP (ORDER BY name)
FROM t GROUP BY category
```

## Type Casting

```sql
SELECT col::VARCHAR                       -- Shorthand (like PostgreSQL)
SELECT col::DECIMAL(10,2)
SELECT CAST(col AS INTEGER)
```

## Date Functions

```sql
SELECT DATE_TRUNC('month', order_date)
SELECT DATEADD(day, 7, order_date)
SELECT DATEDIFF(day, start_date, end_date)    -- end - start
SELECT EXTRACT(year FROM dt)
SELECT CHARINDEX('search', s)             -- Find substring position (0 if not found)
```

## Key Limitations vs PostgreSQL

Redshift lacks many PostgreSQL features:
- **No arrays** or array functions
- **No LATERAL** joins (use correlated subqueries)
- **No RETURNING** clause on INSERT/UPDATE/DELETE
- **No ON CONFLICT** / UPSERT (use MERGE in recent versions)
- **No GENERATE_SERIES** (use recursive CTE or stl_scan trick)
- **No regex capture groups** in REGEXP_SUBSTR
- **Limited JSON** (stored as VARCHAR, verbose functions)
