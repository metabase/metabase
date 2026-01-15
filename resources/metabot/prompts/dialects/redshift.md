# Redshift SQL Dialect Instructions

Redshift is based on **PostgreSQL 8.0.2** with significant modifications for columnar analytics. Many PostgreSQL features are missing or different.

## Identifier Quoting

- Use **double quotes** for reserved words or special characters: `"order"`, `"user-id"`
- **Unquoted identifiers are lowercased**: `SELECT Col` → `col`
- Identifiers are case-insensitive

```sql
SELECT "order", "group" FROM my_table     -- quoted: reserved words
SELECT order_date, user_id FROM my_table  -- unquoted: lowercased
```

## String Operations

```sql
SELECT
  first_name || ' ' || last_name,         -- concatenation (preferred)
  CONCAT(a, b),                           -- two args only
  LOWER(s), UPPER(s), TRIM(s),
  SUBSTRING(s, 1, 3),                     -- 1-indexed (also: SUBSTR)
  LEN(s),                                 -- NOT LENGTH
  REPLACE(s, 'old', 'new'),
  SPLIT_PART(csv, ',', 1),                -- returns element (1-indexed)
  REGEXP_SUBSTR(s, 'pattern'),
  REGEXP_REPLACE(s, 'pattern', 'repl'),
  CHARINDEX('search', s),                 -- position of substring (0 if not found)
  LEFT(s, 3), RIGHT(s, 3),
  LTRIM(s), RTRIM(s),
  LISTAGG(col, ', ') WITHIN GROUP (ORDER BY col)  -- aggregate strings
```

**Note**: Use `LEN()` not `LENGTH()`. Use `SUBSTRING()` not `SUBSTR()` for clarity.

## Date and Time

```sql
-- Current
SELECT
  CURRENT_DATE,                           -- DATE
  GETDATE(),                              -- TIMESTAMP (preferred over CURRENT_TIMESTAMP)
  SYSDATE                                 -- TIMESTAMP (alias)

-- Truncation
SELECT DATE_TRUNC('month', order_date)    -- year, quarter, month, week, day, hour, minute, second

-- Arithmetic
SELECT
  DATEADD(day, 7, order_date),
  DATEADD(month, -1, order_date),
  DATEDIFF(day, start_date, end_date),    -- end - start
  order_date + INTERVAL '7 days',         -- interval syntax also works
  order_date + 7                          -- add days directly to DATE

-- Extraction
SELECT
  EXTRACT(year FROM dt),
  EXTRACT(month FROM dt),
  EXTRACT(day FROM dt),
  EXTRACT(dow FROM dt),                   -- 0=Sunday, 6=Saturday
  EXTRACT(hour FROM ts),
  DATE_PART('year', dt)                   -- alternative to EXTRACT

-- Formatting/Parsing
SELECT
  TO_CHAR(dt, 'YYYY-MM-DD'),
  TO_CHAR(ts, 'YYYY-MM-DD HH24:MI:SS'),
  TO_DATE(str, 'YYYY-MM-DD'),
  TO_TIMESTAMP(str, 'YYYY-MM-DD HH24:MI:SS'),
  CONVERT(DATE, ts)                       -- truncate timestamp to date
```

## Type Casting

```sql
SELECT
  CAST(col AS INTEGER),
  col::VARCHAR,                           -- shorthand syntax
  col::DECIMAL(10,2),
  CAST(col AS BIGINT),
  TO_NUMBER(str, '9999.99'),              -- with format
  str::DATE,
  ts::DATE                                -- truncate timestamp

-- Types: SMALLINT, INTEGER, BIGINT, DECIMAL/NUMERIC(p,s), REAL, DOUBLE PRECISION,
--        BOOLEAN, CHAR(n), VARCHAR(n), DATE, TIMESTAMP, TIMESTAMPTZ
```

**Important**: No `TRY_CAST`. Invalid casts raise errors. Validate data first.

## NULL Handling

```sql
SELECT
  COALESCE(a, b, c),                      -- first non-null
  NVL(nullable, 'default'),               -- two-arg version
  NVL2(col, 'not null', 'is null'),       -- conditional on NULL
  NULLIF(col, ''),                        -- NULL if equal
  DECODE(col, NULL, 'N/A', col),          -- DECODE handles NULL specially
  CASE WHEN col IS NULL THEN 'N/A' ELSE col END
```

**Note**: No `IFNULL()`. Use `NVL()` or `COALESCE()`.

## Boolean Logic

```sql
SELECT
  CASE WHEN cond THEN 'yes' ELSE 'no' END,
  DECODE(status, 'A', 'Active', 'I', 'Inactive', 'Unknown'),  -- switch/case alternative
  NVL2(nullable_col, 'has value', 'is null')
```

**Note**: No `IF()` or `IFF()` function. Use `CASE` or `DECODE`.

## JSON Handling (Limited)

```sql
-- Redshift has basic JSON functions (not as powerful as Snowflake/BigQuery)
SELECT
  JSON_EXTRACT_PATH_TEXT(json_col, 'field'),              -- top-level
  JSON_EXTRACT_PATH_TEXT(json_col, 'nested', 'field'),    -- nested path
  JSON_EXTRACT_ARRAY_ELEMENT_TEXT(json_col, 0),           -- array element
  IS_VALID_JSON(col),                                      -- validation
  JSON_ARRAY_LENGTH(json_col)

-- For complex JSON, consider using Redshift Spectrum with Parquet
```

**Limitation**: No native JSON type. JSON stored as VARCHAR. No colon/arrow notation.

## Window Functions

```sql
SELECT
  ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC),
  RANK() OVER (PARTITION BY cat ORDER BY amt DESC),
  DENSE_RANK() OVER (PARTITION BY cat ORDER BY amt DESC),
  SUM(amt) OVER (PARTITION BY cat),
  LAG(amt, 1) OVER (ORDER BY dt),
  LEAD(amt, 1) OVER (ORDER BY dt),
  FIRST_VALUE(amt) OVER (PARTITION BY cat ORDER BY dt ROWS UNBOUNDED PRECEDING),
  LAST_VALUE(amt) OVER (PARTITION BY cat ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING),
  SUM(amt) OVER (ORDER BY dt ROWS UNBOUNDED PRECEDING) AS running_total,
  NTILE(4) OVER (ORDER BY amt),
  PERCENT_RANK() OVER (ORDER BY amt),
  CUME_DIST() OVER (ORDER BY amt),
  MEDIAN(amt) OVER (PARTITION BY cat),                     -- window median
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amt) OVER (PARTITION BY cat)
```

**Important**: No `QUALIFY` clause. Must use subquery to filter on window functions.

## Filtering on Window Functions (No QUALIFY)

```sql
-- Redshift doesn't have QUALIFY, use subquery instead
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC) AS rn
  FROM sales
)
WHERE rn <= 3

-- Deduplication
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) AS rn
  FROM t
)
WHERE rn = 1
```

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amt), AVG(amt), MIN(val), MAX(val),
  MEDIAN(col),                            -- exact median (aggregate)
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY col),   -- also median
  PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY col),   -- discrete percentile
  APPROXIMATE COUNT(DISTINCT col),        -- HyperLogLog (note: space before COUNT)
  STDDEV(col), VARIANCE(col),
  BOOL_OR(bool_col), BOOL_AND(bool_col),
  LISTAGG(col, ', ') WITHIN GROUP (ORDER BY col)
FROM t GROUP BY grp
```

**Note**: Approximate count syntax is `APPROXIMATE COUNT(DISTINCT col)` with a space.

## CTEs

```sql
WITH
  cte1 AS (SELECT * FROM t1 WHERE cond),
  cte2 AS (SELECT * FROM cte1 JOIN t2 USING (id))
SELECT * FROM cte2

-- Recursive CTEs (Redshift supports since late 2021)
WITH RECURSIVE hierarchy AS (
  SELECT id, parent_id, name, 1 AS level FROM orgs WHERE parent_id IS NULL
  UNION ALL
  SELECT o.id, o.parent_id, o.name, h.level + 1
  FROM orgs o JOIN hierarchy h ON o.parent_id = h.id
)
SELECT * FROM hierarchy
```

## JOINs

```sql
SELECT * FROM a INNER JOIN b ON a.id = b.a_id
SELECT * FROM a LEFT JOIN b ON a.id = b.a_id
SELECT * FROM a RIGHT JOIN b ON a.id = b.a_id
SELECT * FROM a FULL OUTER JOIN b ON a.id = b.a_id
SELECT * FROM a CROSS JOIN b
SELECT * FROM a JOIN b USING (id)
SELECT * FROM a NATURAL JOIN b
```

**Limitation**: No `LATERAL` joins. Use correlated subqueries instead.

## Set Operations

```sql
SELECT col FROM t1 UNION SELECT col FROM t2          -- dedupe
SELECT col FROM t1 UNION ALL SELECT col FROM t2      -- keep all
SELECT col FROM t1 INTERSECT SELECT col FROM t2
SELECT col FROM t1 EXCEPT SELECT col FROM t2
```

## Common Patterns

```sql
-- Safe division
SELECT
  NULLIF(denom, 0) AS safe_denom,         -- then divide
  CASE WHEN denom = 0 THEN NULL ELSE num / denom END,
  CASE WHEN denom = 0 THEN 0 ELSE num / denom END

-- Conditional aggregation
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
  SUM(CASE WHEN type = 'rev' THEN amt ELSE 0 END) AS revenue

-- Date spine (using system table)
SELECT (DATE '2024-01-01' + n)::DATE AS dt
FROM (SELECT ROW_NUMBER() OVER () - 1 AS n FROM stl_scan LIMIT 365)

-- Coalesce empty string to NULL
SELECT NULLIF(TRIM(col), '') AS clean_col

-- Top N per group (no QUALIFY)
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC) AS rn
  FROM sales
) WHERE rn <= 3
```

## Distribution and Sort Keys (Performance Critical)

```sql
-- When creating tables, distribution affects join performance
-- DISTSTYLE KEY: co-locate rows with same key on same node
-- SORTKEY: optimize range-restricted scans and merge joins

-- Query patterns should filter on sort key columns
SELECT * FROM events
WHERE event_date >= '2024-01-01'          -- SORTKEY filter: efficient
  AND user_id = 12345

-- Join on distribution key is most efficient
SELECT * FROM orders o
JOIN customers c ON o.customer_id = c.id  -- if customer_id is DISTKEY: no redistribution
```

## Performance Considerations

- **Filter on SORTKEY**: Range filters on sort key columns enable zone map pruning
- **Join on DISTKEY**: Joins on distribution key avoid data redistribution
- **Avoid SELECT ***: Columnar storage benefits from column pruning
- **Use APPROXIMATE COUNT**: For large distinct counts, use HyperLogLog
- **Avoid correlated subqueries**: Rewrite as JOINs when possible
- **Limit result sets**: Use LIMIT, especially in development
- **VACUUM/ANALYZE**: Keep statistics fresh for optimizer

## Key Differences from Other Dialects

| Feature | Redshift | Others |
|---------|----------|--------|
| String length | `LEN()` | `LENGTH()` (Postgres/BQ) |
| Ternary | `CASE`/`DECODE` | `IF()`/`IFF()` |
| No QUALIFY | Subquery required | `QUALIFY` (Snowflake/BQ) |
| Approx distinct | `APPROXIMATE COUNT(DISTINCT)` | `APPROX_COUNT_DISTINCT()` |
| JSON access | `JSON_EXTRACT_PATH_TEXT()` | `:` or `->` notation |
| No LATERAL | Use correlated subqueries | `LATERAL` (Postgres/Snowflake) |
| No TRY_CAST | Validate first | `TRY_CAST`/`SAFE_CAST` |
| Current time | `GETDATE()` | `NOW()`/`CURRENT_TIMESTAMP` |

## Limitations vs PostgreSQL

- No arrays or array functions
- No `LATERAL` joins
- Limited JSON support (no native type)
- No `RETURNING` clause
- No `UPSERT`/`ON CONFLICT` (use MERGE in recent versions)
- No regex capture groups in `REGEXP_SUBSTR`
- No `GENERATE_SERIES` (use stl_scan trick or recursive CTE)
