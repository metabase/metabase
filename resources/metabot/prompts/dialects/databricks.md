# Databricks (Spark SQL) Dialect Instructions

Databricks uses **Spark SQL** with additional Delta Lake extensions. Follow these dialect-specific rules.

## Identifier Quoting

- Use **backticks** for identifiers: `` `my column` ``, `` `table-name` ``
- Identifiers are **case-insensitive** by default
- String literals use **single quotes**: `'string value'`

```sql
SELECT `Column Name`, `select` FROM `my-table`
```

## String Operations

```sql
-- Concatenation: CONCAT function or || operator
SELECT CONCAT(first_name, ' ', last_name) AS full_name
SELECT first_name || ' ' || last_name AS full_name

-- String functions
SELECT
  LOWER(name), UPPER(name), INITCAP(name),
  TRIM(name), LTRIM(name), RTRIM(name),
  SUBSTR(name, 1, 3),                    -- 1-indexed, SUBSTRING also works
  LENGTH(name), CHAR_LENGTH(name),
  REPLACE(name, 'old', 'new'),
  SPLIT(csv_col, ','),                   -- Returns ARRAY<STRING>
  SPLIT(csv_col, ',')[0],                -- Array access (0-indexed)
  INSTR(name, 'sub'),                    -- Find position (1-indexed result)
  LEFT(name, 3), RIGHT(name, 3),
  LPAD(num, 5, '0'), RPAD(name, 10, ' '),
  REGEXP_EXTRACT(text, 'pattern', 0),
  REGEXP_REPLACE(text, 'pattern', 'replacement')

-- Pattern matching
SELECT * FROM t WHERE name LIKE 'A%'
SELECT * FROM t WHERE name RLIKE '^[A-Z]'  -- Regex match
SELECT * FROM t WHERE name REGEXP '^[A-Z]' -- Same as RLIKE
```

## Date and Time

```sql
-- Current date/time
SELECT
  CURRENT_DATE,                          -- DATE (no parens)
  CURRENT_TIMESTAMP,                     -- TIMESTAMP
  NOW()                                  -- Same as CURRENT_TIMESTAMP

-- Date truncation
SELECT DATE_TRUNC('MONTH', order_date)   -- YEAR, QUARTER, MONTH, WEEK, DAY, HOUR, MINUTE, SECOND
SELECT TRUNC(order_date, 'MM')           -- Alternative syntax

-- Date arithmetic
SELECT
  DATE_ADD(order_date, 7),               -- Add days
  DATE_SUB(order_date, 7),               -- Subtract days
  ADD_MONTHS(order_date, 1),             -- Add months
  order_date + INTERVAL 7 DAY,           -- INTERVAL syntax
  order_date + INTERVAL '2' HOUR,
  DATEDIFF(end_date, start_date),        -- Days between (end - start)
  MONTHS_BETWEEN(end_date, start_date)

-- Extraction
SELECT
  YEAR(order_date), MONTH(order_date), DAY(order_date),
  DAYOFWEEK(order_date),                 -- 1=Sunday, 7=Saturday
  DAYOFYEAR(order_date),
  HOUR(ts), MINUTE(ts), SECOND(ts),
  QUARTER(order_date), WEEKOFYEAR(order_date),
  EXTRACT(YEAR FROM order_date)          -- Standard SQL

-- Formatting and parsing
SELECT
  DATE_FORMAT(order_date, 'yyyy-MM-dd'),
  DATE_FORMAT(ts, 'yyyy-MM-dd HH:mm:ss'),
  TO_DATE('2024-01-15', 'yyyy-MM-dd'),
  TO_TIMESTAMP('2024-01-15 10:30:00', 'yyyy-MM-dd HH:mm:ss'),
  UNIX_TIMESTAMP(ts),                    -- To Unix epoch
  FROM_UNIXTIME(epoch_seconds)           -- From Unix epoch
```

**Important**: Date format patterns use Java SimpleDateFormat: `yyyy` (year), `MM` (month), `dd` (day), `HH` (24-hour), `mm` (minute), `ss` (second).

## Type Casting

```sql
-- Standard CAST
SELECT CAST(string_col AS INT)
SELECT CAST(string_col AS DOUBLE)
SELECT CAST(string_col AS DATE)
SELECT CAST(string_col AS TIMESTAMP)
SELECT CAST(123 AS STRING)

-- Double colon shorthand (Databricks SQL)
SELECT string_col::INT

-- TRY_CAST (returns NULL on failure)
SELECT TRY_CAST(potentially_bad_data AS INT)

-- Type names: STRING, INT, BIGINT, SMALLINT, TINYINT, FLOAT, DOUBLE, DECIMAL(p,s),
--             BOOLEAN, DATE, TIMESTAMP, BINARY, ARRAY<T>, MAP<K,V>, STRUCT<...>
```

## NULL Handling

```sql
SELECT
  COALESCE(nullable_col, 'default'),     -- First non-null value
  NVL(nullable_col, 'default'),          -- Two-argument (same as IFNULL)
  IFNULL(nullable_col, 'default'),       -- Two-argument alias
  NVL2(col, 'not null', 'null'),         -- If col not null, return 2nd, else 3rd
  NULLIF(col, ''),                       -- Returns NULL if col = ''
  IF(condition, true_val, false_val),    -- Ternary expression
  CASE WHEN col IS NULL THEN 'N/A' ELSE col END
```

## Arrays

```sql
-- Array literal
SELECT ARRAY(1, 2, 3)

-- Array access (0-indexed!)
SELECT my_array[0] AS first_element

-- Array functions
SELECT
  SIZE(arr),                             -- Array length (also: CARDINALITY)
  ARRAY_CONTAINS(arr, value),            -- Membership test
  ARRAY_POSITION(arr, value),            -- Find index (1-indexed result, 0 if not found)
  ELEMENT_AT(arr, 1),                    -- 1-indexed access, supports negative
  ARRAY_JOIN(arr, ', '),                 -- Join to string (also: CONCAT_WS)
  ARRAY_DISTINCT(arr),                   -- Remove duplicates
  ARRAY_SORT(arr),
  ARRAY_UNION(arr1, arr2),
  ARRAY_INTERSECT(arr1, arr2),
  ARRAY_EXCEPT(arr1, arr2),
  FLATTEN(nested_arr),                   -- Flatten nested array
  SLICE(arr, 1, 3)                       -- Slice from index 1, length 3

-- EXPLODE: flatten array to rows
SELECT id, exploded_val
FROM t LATERAL VIEW EXPLODE(arr) AS exploded_val

-- EXPLODE with index
SELECT id, pos, val
FROM t LATERAL VIEW POSEXPLODE(arr) AS pos, val

-- Inline EXPLODE (simpler syntax)
SELECT id, EXPLODE(arr) FROM t

-- Generate sequence
SELECT SEQUENCE(1, 10)                   -- [1, 2, ..., 10]
SELECT SEQUENCE(1, 10, 2)                -- [1, 3, 5, 7, 9]
SELECT SEQUENCE(DATE'2024-01-01', DATE'2024-12-31', INTERVAL 1 MONTH)
```

## Structs and Maps

```sql
-- Struct literal
SELECT STRUCT(1 AS id, 'Alice' AS name) AS person
SELECT NAMED_STRUCT('id', 1, 'name', 'Alice') AS person

-- Struct access (dot notation)
SELECT person.id, person.name FROM t

-- Map literal
SELECT MAP('key1', 'val1', 'key2', 'val2') AS my_map

-- Map access
SELECT my_map['key1']
SELECT MAP_KEYS(my_map), MAP_VALUES(my_map)

-- Explode map
SELECT key, value FROM t LATERAL VIEW EXPLODE(my_map) AS key, value
```

## JSON Handling

```sql
-- Extract from JSON string
SELECT
  GET_JSON_OBJECT(json_str, '$.field'),           -- Returns STRING
  GET_JSON_OBJECT(json_str, '$.nested.path'),
  GET_JSON_OBJECT(json_str, '$.array[0]'),
  JSON_TUPLE(json_str, 'field1', 'field2'),       -- Multiple fields at once
  FROM_JSON(json_str, 'struct<id:int,name:string>'), -- Parse to struct
  TO_JSON(struct_col)                             -- Struct to JSON string

-- JSON path with : syntax (Databricks SQL)
SELECT json_col:field, json_col:nested.path, json_col:array[0]

-- Schema inference
SELECT SCHEMA_OF_JSON(json_str)                   -- Get schema of JSON
```

## Window Functions

```sql
SELECT
  ROW_NUMBER() OVER (PARTITION BY cat ORDER BY amt DESC),
  RANK() OVER (PARTITION BY cat ORDER BY amt DESC),
  DENSE_RANK() OVER (PARTITION BY cat ORDER BY amt DESC),
  SUM(amt) OVER (PARTITION BY cat),
  LAG(amt, 1, 0) OVER (ORDER BY dt),              -- With default value
  LEAD(amt) OVER (ORDER BY dt),
  FIRST_VALUE(amt) OVER (PARTITION BY cat ORDER BY dt),
  LAST_VALUE(amt) OVER (
    PARTITION BY cat ORDER BY dt
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  ),
  NTH_VALUE(amt, 2) OVER w,
  NTILE(4) OVER (ORDER BY amt),
  PERCENT_RANK() OVER w,
  SUM(amt) OVER (ORDER BY dt ROWS UNBOUNDED PRECEDING) AS running_total,
  AVG(amt) OVER (ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS moving_avg
FROM t
WINDOW w AS (PARTITION BY cat ORDER BY dt)
```

## Aggregation

```sql
SELECT
  COUNT(*), COUNT(DISTINCT col),
  SUM(amount), AVG(amount),
  MIN(val), MAX(val),
  COLLECT_LIST(col),                     -- Aggregate to array (with duplicates)
  COLLECT_SET(col),                      -- Aggregate to array (distinct)
  ARRAY_AGG(col),                        -- Same as COLLECT_LIST
  CONCAT_WS(', ', COLLECT_LIST(name)),   -- String aggregation
  APPROX_COUNT_DISTINCT(col),            -- HyperLogLog approximate count
  PERCENTILE_APPROX(col, 0.5),           -- Approximate median
  PERCENTILE(col, 0.5)                   -- Exact percentile (for smaller datasets)
FROM t GROUP BY category
```

## Common Table Expressions (CTEs)

```sql
WITH active_users AS (
  SELECT * FROM users WHERE status = 'active'
),
recent_orders AS (
  SELECT * FROM orders WHERE order_date > DATE_SUB(CURRENT_DATE, 30)
)
SELECT * FROM active_users a JOIN recent_orders r ON a.id = r.user_id
```

## QUALIFY Clause (Filter on Window Functions)

```sql
-- Get top 3 per category (Databricks supports QUALIFY!)
SELECT *
FROM sales
QUALIFY ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) <= 3
```

## Higher-Order Functions

```sql
-- TRANSFORM: apply function to each array element
SELECT TRANSFORM(arr, x -> x * 2)
SELECT TRANSFORM(arr, (x, i) -> x + i)   -- With index

-- FILTER: filter array elements
SELECT FILTER(arr, x -> x > 0)

-- AGGREGATE: reduce array
SELECT AGGREGATE(arr, 0, (acc, x) -> acc + x)

-- EXISTS: check if any element matches
SELECT EXISTS(arr, x -> x > 100)

-- FORALL: check if all elements match
SELECT FORALL(arr, x -> x > 0)
```

## Delta Lake Specific

```sql
-- Time travel (query historical versions)
SELECT * FROM my_table VERSION AS OF 5
SELECT * FROM my_table TIMESTAMP AS OF '2024-01-15 10:00:00'
SELECT * FROM my_table@v5

-- Describe history
DESCRIBE HISTORY my_table

-- MERGE (upsert)
MERGE INTO target t
USING source s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
```

## Performance Considerations

### Partition Pruning
```sql
-- Good: filter on partition column
SELECT * FROM events WHERE event_date = '2024-01-15'

-- Bad: function on partition column prevents pruning
SELECT * FROM events WHERE DATE(event_timestamp) = '2024-01-15'
```

### Predicate Pushdown
```sql
-- Good: simple predicates push down to storage
SELECT * FROM t WHERE status = 'active' AND amount > 100

-- Bad: complex expressions may not push down
SELECT * FROM t WHERE UPPER(status) = 'ACTIVE'
```

## Common Patterns

### Safe Division
```sql
SELECT
  TRY_DIVIDE(numerator, denominator),    -- Returns NULL if denominator is 0
  numerator / NULLIF(denominator, 0),    -- Alternative
  IF(denominator = 0, 0, numerator / denominator)
```

### Conditional Aggregation
```sql
SELECT
  COUNT(*) AS total,
  COUNT_IF(status = 'active') AS active_count,
  SUM(IF(type = 'revenue', amount, 0)) AS revenue,
  SUM(CASE WHEN region = 'US' THEN amount END) AS us_amount
FROM t
```

### Date Spine Generation
```sql
SELECT EXPLODE(SEQUENCE(DATE'2024-01-01', DATE'2024-12-31', INTERVAL 1 DAY)) AS dt
```

### Pivoting
```sql
SELECT * FROM t
PIVOT (
  SUM(amount) FOR year IN (2023, 2024)
)
```

### Unpivoting
```sql
SELECT * FROM t
UNPIVOT (
  amount FOR year IN (`2023`, `2024`)
)
```

## Key Differences from Other Dialects

| Feature | Databricks | BigQuery | PostgreSQL | Snowflake |
|---------|------------|----------|------------|-----------|
| Identifier quotes | `` `backtick` `` | `` `backtick` `` | `"double"` | `"double"` |
| Array index | 0-based | 0-based | 1-based | 0-based |
| Array aggregate | `COLLECT_LIST` | `ARRAY_AGG` | `ARRAY_AGG` | `ARRAY_AGG` |
| Explode array | `EXPLODE` / `LATERAL VIEW` | `UNNEST` | `UNNEST` | `FLATTEN` |
| JSON path | `GET_JSON_OBJECT` or `:` | `JSON_VALUE` | `->`, `->>` | `:` path |
| Approx count | `APPROX_COUNT_DISTINCT` | `APPROX_COUNT_DISTINCT` | N/A | `APPROX_COUNT_DISTINCT` |
| Safe cast | `TRY_CAST` | `SAFE_CAST` | N/A | `TRY_CAST` |
| Date format | Java patterns | `%Y-%m-%d` | `YYYY-MM-DD` | `YYYY-MM-DD` |
| QUALIFY | Yes | Yes | No | Yes |
| Higher-order functions | Yes | No | No | No |
