# Snowflake SQL Dialect Instructions

## Identifier Quoting

- Use **double quotes** for case-sensitive or special-character identifiers: `"my-column"`, `"Order"`
- **Unquoted identifiers are uppercased**: `select col` → `COL`
- Quoted identifiers preserve case: `"myColumn"` stays `myColumn`
- String comparisons are case-sensitive by default

```sql
SELECT "order", "user-id" FROM "My Table"  -- quoted: exact case
SELECT order_date, user_id FROM my_table   -- unquoted: uppercased internally
```

## String Operations

```sql
SELECT
  first_name || ' ' || last_name,        -- concatenation
  CONCAT(a, b, c),                        -- multi-arg concat
  LOWER(s), UPPER(s), TRIM(s),
  SUBSTR(s, 1, 3),                        -- 1-indexed
  LENGTH(s), REPLACE(s, 'old', 'new'),
  SPLIT(csv, ','),                        -- returns ARRAY
  SPLIT_PART(csv, ',', 1),                -- returns element (1-indexed)
  REGEXP_SUBSTR(s, 'pattern'),
  REGEXP_REPLACE(s, 'pattern', 'repl'),
  STARTSWITH(s, 'prefix'),
  ENDSWITH(s, 'suffix'),
  CONTAINS(s, 'search'),
  LISTAGG(col, ', ') WITHIN GROUP (ORDER BY col)  -- aggregate strings
```

## Date and Time

```sql
-- Current
SELECT CURRENT_DATE, CURRENT_TIMESTAMP, SYSDATE()

-- Truncation (returns same type)
SELECT DATE_TRUNC('month', order_date)   -- year, quarter, month, week, day, hour, minute, second

-- Arithmetic
SELECT
  DATEADD(day, 7, order_date),
  DATEADD(month, -1, order_date),
  DATEDIFF(day, start_date, end_date),   -- end - start
  TIMESTAMPADD(hour, 2, ts),
  TIMESTAMPDIFF(minute, start_ts, end_ts)

-- Extraction
SELECT
  YEAR(dt), MONTH(dt), DAY(dt),
  DAYOFWEEK(dt),                          -- 0=Sunday, 6=Saturday
  HOUR(ts), MINUTE(ts),
  EXTRACT(epoch FROM ts)                  -- Unix timestamp

-- Formatting/Parsing
SELECT
  TO_CHAR(dt, 'YYYY-MM-DD'),
  TO_DATE(str, 'YYYY-MM-DD'),
  TO_TIMESTAMP(str, 'YYYY-MM-DD HH24:MI:SS'),
  TRY_TO_DATE(str, 'YYYY-MM-DD')          -- NULL on failure
```

## Type Casting

```sql
SELECT
  CAST(col AS INTEGER),
  col::VARCHAR,                            -- shorthand syntax
  col::NUMBER(10,2),
  TRY_CAST(col AS INTEGER),                -- NULL on failure
  TO_NUMBER(str), TO_VARCHAR(num),
  TO_BOOLEAN(str)

-- Types: VARCHAR, NUMBER, INTEGER, FLOAT, BOOLEAN, DATE, TIMESTAMP, TIMESTAMP_NTZ,
--        TIMESTAMP_LTZ, TIMESTAMP_TZ, VARIANT, ARRAY, OBJECT
```

## NULL Handling

```sql
SELECT
  COALESCE(a, b, c),                       -- first non-null
  NVL(nullable, 'default'),                -- two-arg version
  IFNULL(nullable, 'default'),             -- alias for NVL
  NVL2(col, 'not null val', 'null val'),   -- if col IS NOT NULL then... else...
  NULLIF(col, ''),                         -- NULL if equal
  IFF(cond, true_val, false_val),          -- ternary (NOT "IF")
  ZEROIFNULL(num),                         -- NULL → 0
  NULLIFZERO(num)                          -- 0 → NULL
```

**Important**: Use `IFF()` not `IF()` for ternary expressions.

## Semi-Structured Data (VARIANT/JSON)

```sql
-- Parse JSON string to VARIANT
SELECT PARSE_JSON('{"name": "Alice", "age": 30}')

-- Access with colon/dot notation (returns VARIANT)
SELECT
  json_col:name,                           -- top-level key
  json_col:address.city,                   -- nested
  json_col:items[0],                       -- array (0-indexed)
  json_col['key-with-dashes']              -- bracket for special chars

-- Extract as typed value
SELECT
  json_col:name::VARCHAR,
  json_col:age::INTEGER,
  GET_PATH(json_col, 'address.city')::VARCHAR,
  TRY_CAST(json_col:count AS INTEGER)      -- safe extraction

-- Check/query
SELECT * FROM t WHERE json_col:status::VARCHAR = 'active'
SELECT * FROM t WHERE IS_NULL_VALUE(json_col:field)   -- JSON null (not SQL NULL)
SELECT * FROM t WHERE json_col:field IS NULL          -- missing key or SQL NULL
```

## Arrays

```sql
-- Construction
SELECT ARRAY_CONSTRUCT(1, 2, 3)
SELECT ARRAY_AGG(col) FROM t GROUP BY grp

-- Access (0-indexed)
SELECT arr[0], arr[1]

-- Functions
SELECT
  ARRAY_SIZE(arr),
  ARRAY_CONTAINS(value::VARIANT, arr),     -- note: value must be VARIANT
  ARRAY_TO_STRING(arr, ', '),
  ARRAY_SLICE(arr, 0, 3),
  ARRAY_CAT(arr1, arr2),
  ARRAY_DISTINCT(arr),
  ARRAY_SORT(arr)

-- FLATTEN: unnest array/object to rows
SELECT t.id, f.value, f.index
FROM my_table t, LATERAL FLATTEN(input => t.arr_col) f

-- FLATTEN nested arrays
SELECT t.id, f.value:name::VARCHAR AS name
FROM my_table t, LATERAL FLATTEN(input => t.json_col:items) f

-- FLATTEN with path
SELECT f.value
FROM my_table t, LATERAL FLATTEN(input => t.json_col, path => 'nested.array') f
```

**Critical**: `FLATTEN` requires `LATERAL` and uses `=>` for named params.

## Window Functions

```sql
SELECT
  ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC),
  RANK() OVER (PARTITION BY cat ORDER BY amt DESC),
  DENSE_RANK() OVER (PARTITION BY cat ORDER BY amt DESC),
  SUM(amt) OVER (PARTITION BY cat),
  LAG(amt, 1) OVER (ORDER BY dt),
  LEAD(amt, 1) OVER (ORDER BY dt),
  FIRST_VALUE(amt) OVER (PARTITION BY cat ORDER BY dt),
  SUM(amt) OVER (ORDER BY dt ROWS UNBOUNDED PRECEDING) AS running_total,
  AVG(amt) OVER (ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
```

## QUALIFY (Filter on Window Functions)

```sql
-- Top N per group
SELECT * FROM sales
QUALIFY ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) <= 3

-- Deduplicate
SELECT * FROM t
QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
```

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amt), AVG(amt), MIN(val), MAX(val),
  MEDIAN(val),                             -- exact median
  APPROX_COUNT_DISTINCT(col),              -- HyperLogLog
  APPROX_PERCENTILE(col, 0.5),
  ARRAY_AGG(col),
  ARRAY_AGG(DISTINCT col) WITHIN GROUP (ORDER BY col),
  OBJECT_AGG(key_col, val_col),            -- aggregate to OBJECT
  LISTAGG(col, ', ') WITHIN GROUP (ORDER BY col),
  BOOLOR_AGG(bool_col), BOOLAND_AGG(bool_col)
FROM t GROUP BY grp
```

## CTEs

```sql
WITH
  cte1 AS (SELECT * FROM t1 WHERE cond),
  cte2 AS (SELECT * FROM cte1 JOIN t2 USING (id))
SELECT * FROM cte2
```

## JOINs

```sql
SELECT * FROM a INNER JOIN b ON a.id = b.a_id
SELECT * FROM a LEFT JOIN b ON a.id = b.a_id
SELECT * FROM a JOIN b USING (id)
SELECT * FROM a CROSS JOIN b
SELECT * FROM a NATURAL JOIN b             -- implicit column matching

-- LATERAL (correlated): each row of a joined with subquery/FLATTEN
SELECT * FROM a, LATERAL (SELECT * FROM b WHERE b.a_id = a.id LIMIT 1)
```

## Set Operations

```sql
SELECT col FROM t1 UNION SELECT col FROM t2          -- dedupe
SELECT col FROM t1 UNION ALL SELECT col FROM t2      -- keep all
SELECT col FROM t1 INTERSECT SELECT col FROM t2
SELECT col FROM t1 EXCEPT SELECT col FROM t2
SELECT col FROM t1 MINUS SELECT col FROM t2          -- alias for EXCEPT
```

## Common Patterns

```sql
-- Safe division
SELECT DIV0(num, denom)                    -- returns 0 if denom is 0
SELECT DIV0NULL(num, denom)                -- returns NULL if denom is 0
SELECT NULLIF(denom, 0) AS safe_denom      -- then divide

-- Conditional aggregation
SELECT
  COUNT(*) AS total,
  COUNT_IF(status = 'active') AS active,   -- Snowflake-specific
  SUM(IFF(type = 'rev', amt, 0)) AS revenue

-- Date spine
SELECT DATEADD(day, seq4(), '2024-01-01'::DATE) AS dt
FROM TABLE(GENERATOR(ROWCOUNT => 365))

-- Pivot
SELECT * FROM sales
PIVOT (SUM(amount) FOR year IN (2023, 2024)) AS p

-- SAMPLE random rows
SELECT * FROM t SAMPLE (1000 ROWS)
SELECT * FROM t SAMPLE (10)                -- 10% of rows
```

## Performance Considerations

- **Cluster keys**: Filter on clustering columns for partition pruning
- **Avoid SELECT ***: Specify columns for columnar storage efficiency
- **Use APPROX functions**: `APPROX_COUNT_DISTINCT` for large cardinalities
- **Micro-partitions**: Filters on sort columns prune partitions
- **COPY/unload**: Use bulk operations for data movement

## Key Differences from Other Dialects

| Feature | Snowflake | Others |
|---------|-----------|--------|
| Ternary | `IFF()` | `IF()` (MySQL/BQ) |
| Count if | `COUNT_IF()` | `COUNTIF()` (BQ) |
| Safe divide | `DIV0()`, `DIV0NULL()` | `SAFE_DIVIDE()` (BQ) |
| Array access | 0-indexed | 1-indexed (Postgres) |
| JSON access | `:` notation | `->` (Postgres) |
| Unnest array | `FLATTEN` | `UNNEST` (BQ/Postgres) |
| Identifiers | UPPERCASE default | lowercase (Postgres) |
