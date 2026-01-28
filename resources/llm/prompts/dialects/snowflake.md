# Snowflake Dialect - Key Differences

This guide covers only Snowflake-specific syntax that differs from standard SQL.

## Identifier Quoting

**CRITICAL: Snowflake UPPERCASES unquoted identifiers (opposite of PostgreSQL).**

| Syntax | Meaning |
|--------|---------|
| `"Name"` | Identifier (preserves case) |
| `'text'` | String literal |

```sql
-- Unquoted identifiers are UPPERCASED
SELECT myColumn FROM t    -- Actually selects "MYCOLUMN"

-- Use double quotes to preserve case
SELECT "myColumn", "order" FROM "My Table"
```

**Schema-qualified names:** Database, schema, and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "MyDatabase"."MySchema"."MyTable"
SELECT * FROM MY_DB.MY_SCHEMA.MY_TABLE    -- unquoted is uppercased

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "MY_DB.MY_SCHEMA.MY_TABLE"  -- Looks for table literally named "MY_DB.MY_SCHEMA.MY_TABLE"
```

## IFF Not IF

**CRITICAL: Snowflake uses `IFF()`, not `IF()` for ternary expressions.**

```sql
SELECT IFF(status = 'active', 'Yes', 'No') AS is_active    -- CORRECT
SELECT IF(status = 'active', 'Yes', 'No')                  -- WRONG: syntax error
```

## JSON/VARIANT Colon Notation

Snowflake uses colon `:` for JSON access (not arrow operators like PostgreSQL):

```sql
-- Colon notation (returns VARIANT)
SELECT json_col:name                          -- Top-level key
SELECT json_col:address.city                  -- Nested path
SELECT json_col:items[0]                      -- Array access (0-indexed)
SELECT json_col['key-with-dashes']            -- Bracket for special chars

-- Cast to get typed value
SELECT json_col:name::VARCHAR
SELECT json_col:age::INTEGER

-- JSON null vs SQL NULL
SELECT * FROM t WHERE IS_NULL_VALUE(json_col:field)   -- JSON null literal
SELECT * FROM t WHERE json_col:field IS NULL          -- Missing key or SQL NULL
```

## FLATTEN (Unnest Arrays/Objects)

Snowflake uses `FLATTEN` instead of `UNNEST`. Requires `LATERAL` and `=>` syntax:

```sql
-- Flatten array to rows
SELECT t.id, f.value, f.index
FROM my_table t, LATERAL FLATTEN(input => t.arr_col) f

-- Flatten nested JSON array
SELECT t.id, f.value:name::VARCHAR AS name
FROM my_table t, LATERAL FLATTEN(input => t.json_col:items) f

-- Flatten with path
SELECT f.value
FROM my_table t, LATERAL FLATTEN(input => t.json_col, path => 'nested.array') f
```

## Arrays (0-Indexed)

Snowflake arrays are **0-indexed** (like BigQuery, unlike PostgreSQL).

```sql
SELECT arr[0] AS first_element               -- 0-indexed!
SELECT ARRAY_CONSTRUCT(1, 2, 3)
SELECT ARRAY_SIZE(arr)

-- ARRAY_CONTAINS requires VARIANT type for the value
SELECT ARRAY_CONTAINS(value::VARIANT, arr)   -- Note: cast value to VARIANT
```

## Safe Division

```sql
SELECT DIV0(numerator, denominator)          -- Returns 0 if denom is 0
SELECT DIV0NULL(numerator, denominator)      -- Returns NULL if denom is 0
```

## QUALIFY (Filter on Window Results)

Like BigQuery, Snowflake supports `QUALIFY`:

```sql
-- Top N per group
SELECT * FROM sales
QUALIFY ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) <= 3

-- Deduplicate
SELECT * FROM t
QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
```

## COUNT_IF (Conditional Counting)

```sql
SELECT
  COUNT_IF(status = 'active') AS active_count,
  SUM(IFF(type = 'revenue', amount, 0)) AS revenue
FROM t
```

## NULL Handling

```sql
SELECT NVL(nullable, 'default')              -- Two-arg (like COALESCE)
SELECT IFNULL(nullable, 'default')           -- Alias for NVL
SELECT NVL2(col, 'not null', 'is null')      -- Three-arg: if NOT NULL then... else...
SELECT ZEROIFNULL(num)                       -- NULL -> 0
SELECT NULLIFZERO(num)                       -- 0 -> NULL
```

## Type Casting

```sql
SELECT col::VARCHAR                          -- Shorthand (like PostgreSQL)
SELECT col::NUMBER(10,2)
SELECT TRY_CAST(col AS INTEGER)              -- NULL on failure (like BigQuery's SAFE_CAST)
SELECT TRY_TO_DATE(str, 'YYYY-MM-DD')        -- NULL on parse failure
```

## String Aggregation (LISTAGG)

```sql
SELECT LISTAGG(name, ', ') WITHIN GROUP (ORDER BY name)
FROM t GROUP BY category
```

## Date Spine Generation

```sql
SELECT DATEADD(day, seq4(), '2024-01-01'::DATE) AS dt
FROM TABLE(GENERATOR(ROWCOUNT => 365))
```

## SAMPLE (Random Rows)

```sql
SELECT * FROM t SAMPLE (1000 ROWS)           -- Fixed row count
SELECT * FROM t SAMPLE (10)                  -- 10% of rows
```

## String Functions

```sql
SELECT SPLIT(csv, ',')                       -- Returns ARRAY
SELECT SPLIT_PART(csv, ',', 1)               -- Returns element (1-indexed)
SELECT STARTSWITH(s, 'prefix')               -- Boolean
SELECT ENDSWITH(s, 'suffix')
SELECT CONTAINS(s, 'search')
```
