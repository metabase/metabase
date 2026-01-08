# Vertica Dialect - Key Differences

Vertica is a columnar analytics database derived from PostgreSQL, but with differences.

## Identifier Quoting

Like PostgreSQL: double quotes, lowercases unquoted identifiers.

```sql
SELECT "CamelCase" FROM t   -- Preserves case
SELECT myColumn FROM t      -- Becomes "mycolumn"
```

**Schema-qualified names:** Schema and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "MySchema"."MyTable"
SELECT * FROM public.orders               -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "public.orders"             -- Looks for table literally named "public.orders"
```

## Arrays (0-Indexed, Unlike PostgreSQL)

**CRITICAL: Vertica arrays are 0-indexed, unlike PostgreSQL's 1-indexed.**

```sql
SELECT my_array[0] AS first_element               -- 0-indexed!
SELECT ARRAY_LENGTH(arr, 1)
SELECT ARRAY_CONTAINS(arr, value)

-- Flatten array
SELECT t.id, elem FROM t, EXPLODE(t.arr) AS elem
```

## PostgreSQL Casting Shorthand

```sql
SELECT '123'::INT, '2024-01-15'::DATE, 123::VARCHAR
```

## ILIKE (Case-Insensitive LIKE)

Like PostgreSQL, Vertica supports ILIKE:

```sql
SELECT * FROM t WHERE name ILIKE 'john%'          -- Case-insensitive
```

## ZEROIFNULL / NULLIFZERO

Vertica-specific convenience functions:

```sql
SELECT ZEROIFNULL(nullable_num)                   -- NULL -> 0
SELECT NULLIFZERO(num_col)                        -- 0 -> NULL
```

## LISTAGG (String Aggregation)

```sql
SELECT LISTAGG(name, ', ') FROM t GROUP BY category
```

## APPROXIMATE_COUNT_DISTINCT

```sql
SELECT APPROXIMATE_COUNT_DISTINCT(user_id)        -- HyperLogLog
```

## TIMESERIES (Gap Filling)

Vertica-specific clause for time-series gap filling:

```sql
SELECT slice_time, TS_LAST_VALUE(value) AS last_val
FROM metrics
TIMESERIES slice_time AS '1 hour'
  OVER (PARTITION BY device_id ORDER BY ts)
```

## RATIO_TO_REPORT

Window function for percentage of group total:

```sql
SELECT category, amount,
  RATIO_TO_REPORT(amount) OVER (PARTITION BY category) AS pct
FROM sales
```

## Date Functions

Like PostgreSQL:

```sql
SELECT DATE_TRUNC('month', order_date)
SELECT order_date + INTERVAL '7 days'
SELECT DATEDIFF('day', start_date, end_date)
SELECT TO_CHAR(order_date, 'YYYY-MM-DD')
```

## MERGE for Upsert

```sql
MERGE INTO target_table t
USING source_table s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET name = s.name
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name)
```

## No QUALIFY - Use Subquery

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) AS rn
  FROM sales
) t WHERE rn = 1
```
