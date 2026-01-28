# Databricks (Spark SQL) Dialect - Key Differences

Databricks uses **Spark SQL** with Delta Lake extensions.

## Identifier Quoting

Backticks for identifiers. Case-insensitive.

```sql
SELECT `Column Name`, `select` FROM `my-table`
```

**Schema-qualified names:** Catalog, schema, and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM `my-catalog`.`my-schema`.`my-table`
SELECT * FROM my_catalog.my_schema.my_table   -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM `my_catalog.my_schema.my_table` -- Looks for table literally named "my_catalog.my_schema.my_table"
```

## Arrays (0-Indexed)

```sql
SELECT my_array[0] AS first_element               -- 0-indexed!
SELECT SIZE(arr)                                  -- Length
SELECT ARRAY_CONTAINS(arr, value)
SELECT ELEMENT_AT(arr, 1)                         -- 1-indexed alternative
```

## EXPLODE (Flatten Array to Rows)

```sql
-- Inline syntax
SELECT id, EXPLODE(arr) FROM t

-- LATERAL VIEW syntax
SELECT id, val FROM t LATERAL VIEW EXPLODE(arr) AS val

-- With position
SELECT id, pos, val FROM t LATERAL VIEW POSEXPLODE(arr) AS pos, val
```

## Array Aggregation

```sql
SELECT COLLECT_LIST(col) FROM t GROUP BY category    -- With duplicates
SELECT COLLECT_SET(col) FROM t GROUP BY category     -- Distinct
SELECT ARRAY_AGG(col) FROM t GROUP BY category       -- Same as COLLECT_LIST
```

## Higher-Order Functions

```sql
SELECT TRANSFORM(arr, x -> x * 2)                 -- Map over array
SELECT FILTER(arr, x -> x > 0)                    -- Filter array
SELECT AGGREGATE(arr, 0, (acc, x) -> acc + x)     -- Reduce
SELECT EXISTS(arr, x -> x > 100)                  -- Any match?
SELECT FORALL(arr, x -> x > 0)                    -- All match?
```

## TRY_CAST and TRY_DIVIDE

```sql
SELECT TRY_CAST(bad_data AS INT)                  -- NULL on failure
SELECT TRY_DIVIDE(numerator, denominator)         -- NULL if denom is 0
```

## IF for Ternary

```sql
SELECT IF(status = 'active', 'Yes', 'No')
SELECT NVL(nullable, 'default')                   -- Also works
SELECT NVL2(col, 'not null', 'is null')
```

## Java Date Format Patterns

```sql
SELECT DATE_FORMAT(order_date, 'yyyy-MM-dd')      -- Java SimpleDateFormat
SELECT TO_DATE('2024-01-15', 'yyyy-MM-dd')
SELECT TO_TIMESTAMP('2024-01-15 10:30:00', 'yyyy-MM-dd HH:mm:ss')
```

## JSON Colon Notation

```sql
SELECT json_col:field                             -- Top-level
SELECT json_col:nested.path                       -- Nested
SELECT json_col:array[0]                          -- Array access
SELECT GET_JSON_OBJECT(json_str, '$.field')       -- Alternative
```

## QUALIFY (Supported)

```sql
SELECT * FROM sales
QUALIFY ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) <= 3
```

## Date Spine with SEQUENCE

```sql
SELECT EXPLODE(SEQUENCE(DATE'2024-01-01', DATE'2024-12-31', INTERVAL 1 DAY)) AS dt
```

## COUNT_IF

```sql
SELECT COUNT_IF(status = 'active') AS active_count
```

## Delta Lake Time Travel

```sql
SELECT * FROM my_table VERSION AS OF 5
SELECT * FROM my_table TIMESTAMP AS OF '2024-01-15 10:00:00'
```

## String Aggregation

```sql
SELECT CONCAT_WS(', ', COLLECT_LIST(name))
FROM t GROUP BY category
```
