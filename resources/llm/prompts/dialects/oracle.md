# Oracle Dialect - Key Differences

This guide covers only Oracle-specific syntax that differs from standard SQL.

## Identifier Quoting

**CRITICAL: Oracle UPPERCASES unquoted identifiers.**

| Syntax | Meaning |
|--------|---------|
| `"Name"` | Identifier (preserves case) |
| `'text'` | String literal |

```sql
SELECT myColumn FROM t    -- Actually selects "MYCOLUMN"
SELECT "myColumn" FROM t  -- Preserves case
```

**Schema-qualified names:** Schema and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "MySchema"."MyTable"
SELECT * FROM HR.EMPLOYEES                -- unquoted is uppercased

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "HR.EMPLOYEES"              -- Looks for table literally named "HR.EMPLOYEES"
```

## DUAL Table Required

Oracle requires `FROM` clause. Use `DUAL` for expressions without a table:

```sql
SELECT SYSDATE FROM DUAL
SELECT 1 + 1 FROM DUAL
```

## CONCAT Only Takes 2 Arguments

```sql
SELECT first_name || ' ' || last_name              -- Use || for multiple values
SELECT CONCAT(CONCAT(first, ' '), last)            -- CONCAT only takes 2 args!
```

## TRUNC for Date Truncation (Not DATE_TRUNC)

```sql
SELECT TRUNC(order_date)              -- To day (removes time)
SELECT TRUNC(order_date, 'MM')        -- To month
SELECT TRUNC(order_date, 'Q')         -- To quarter
SELECT TRUNC(order_date, 'YYYY')      -- To year
SELECT TRUNC(order_date, 'IW')        -- To ISO week (Monday)
```

## ROWNUM Gotcha

**CRITICAL: `ROWNUM` is applied BEFORE `ORDER BY`.** Always wrap in subquery:

```sql
-- WRONG: Gets random 10 rows, then sorts
SELECT * FROM orders WHERE ROWNUM <= 10 ORDER BY order_date DESC

-- CORRECT: Sort first, then limit
SELECT * FROM (
  SELECT * FROM orders ORDER BY order_date DESC
) WHERE ROWNUM <= 10

-- Better: Use FETCH FIRST (12c+)
SELECT * FROM orders ORDER BY order_date DESC
FETCH FIRST 10 ROWS ONLY
```

## Pagination

```sql
-- 12c+ syntax
SELECT * FROM orders ORDER BY order_date DESC
OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY

-- Pre-12c: Use ROW_NUMBER
SELECT * FROM (
  SELECT t.*, ROW_NUMBER() OVER (ORDER BY order_date DESC) rn FROM orders t
) WHERE rn BETWEEN 21 AND 30
```

## NVL, NVL2, DECODE

```sql
SELECT NVL(nullable, 'default')               -- Two-arg null coalescing
SELECT NVL2(col, 'not null', 'is null')       -- If NOT NULL then 2nd, else 3rd
SELECT COALESCE(a, b, c)                      -- Standard, multiple args

-- DECODE: Oracle-specific CASE that handles NULL
SELECT DECODE(status, 'A', 'Active', 'I', 'Inactive', 'Unknown')
SELECT DECODE(col, NULL, 'is null', 'not null')   -- Can compare to NULL!
```

## Date Functions

```sql
SELECT SYSDATE FROM DUAL                      -- Current date+time
SELECT SYSTIMESTAMP FROM DUAL                 -- With timezone

SELECT order_date + 7                         -- Add days directly
SELECT ADD_MONTHS(order_date, 3)              -- Add months (handles month-end)
SELECT MONTHS_BETWEEN(end_date, start_date)   -- Fractional months

SELECT EXTRACT(YEAR FROM order_date)
SELECT TO_CHAR(order_date, 'YYYY-MM-DD')      -- Format
SELECT TO_CHAR(order_date, 'FMMonth DD')      -- FM removes padding
SELECT TO_DATE('2024-01-15', 'YYYY-MM-DD')    -- Parse
```

## String Aggregation (LISTAGG)

```sql
SELECT LISTAGG(name, ', ') WITHIN GROUP (ORDER BY name)
FROM t GROUP BY category

-- DISTINCT requires 19c+
SELECT LISTAGG(DISTINCT name, ', ') WITHIN GROUP (ORDER BY name)
FROM t GROUP BY category
```

## CONNECT BY (Hierarchies and Sequences)

```sql
-- Generate sequence
SELECT LEVEL AS n FROM DUAL CONNECT BY LEVEL <= 100

-- Date range
SELECT DATE '2024-01-01' + LEVEL - 1 AS dt
FROM DUAL CONNECT BY LEVEL <= 365

-- Hierarchical query
SELECT id, name, LEVEL, SYS_CONNECT_BY_PATH(name, '/')
FROM employees
START WITH manager_id IS NULL
CONNECT BY PRIOR id = manager_id
```

## KEEP FIRST/LAST (First Row Per Group)

```sql
-- Oracle-specific aggregate
SELECT category,
  MAX(name) KEEP (DENSE_RANK FIRST ORDER BY updated_at DESC) AS latest_name
FROM products GROUP BY category

-- Standard approach
SELECT * FROM (
  SELECT t.*, ROW_NUMBER() OVER (PARTITION BY category ORDER BY updated_at DESC) rn
  FROM products t
) WHERE rn = 1
```

## JSON Functions (12c+)

```sql
SELECT JSON_VALUE(json_col, '$.key')              -- Scalar value
SELECT JSON_QUERY(json_col, '$.object')           -- Object/array
SELECT JSON_VALUE(json_col, '$.items[0].name')    -- Array access
SELECT JSON_EXISTS(json_col, '$.key')             -- Boolean check

-- JSON_TABLE: parse to rows
SELECT jt.* FROM t,
JSON_TABLE(t.json_col, '$.items[*]'
  COLUMNS (id NUMBER PATH '$.id', name VARCHAR2(100) PATH '$.name')
) jt
```

## MERGE for Upsert

```sql
MERGE INTO target_table t
USING source_table s ON (t.id = s.id)
WHEN MATCHED THEN UPDATE SET t.name = s.name
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);
```

## No QUALIFY - Use Subquery

```sql
SELECT * FROM (
  SELECT t.*, ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) rn
  FROM sales t
) WHERE rn = 1
```

## Substring Position

```sql
SELECT INSTR(name, 'sub')           -- 1-indexed, 0 if not found
SELECT INSTR(name, 'sub', 1, 2)     -- 2nd occurrence
SELECT SUBSTR(name, 1, 3)           -- Substring (1-indexed)
```
