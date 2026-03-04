# ClickHouse Dialect - Key Differences

ClickHouse is a columnar OLAP database with unique syntax.

## Identifier Quoting

Double quotes or backticks. **Case-sensitive** identifiers.

```sql
SELECT "Column-Name", `another column` FROM my_table
```

**Schema-qualified names:** Database and table are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "my-database"."My-Table"
SELECT * FROM my_database.my_table        -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "my_database.my_table"      -- Looks for table literally named "my_database.my_table"
```

## Date Truncation Functions

ClickHouse uses `toStartOf*` functions (though `date_trunc` also works):

```sql
SELECT toStartOfMonth(dt)                          -- Truncate to month
SELECT toStartOfYear(dt), toStartOfQuarter(dt)
SELECT toStartOfWeek(dt)                           -- Monday
SELECT toStartOfDay(dt), toStartOfHour(dt)
SELECT toDate(dt)                                  -- Truncate to Date
SELECT date_trunc('month', dt)                     -- Standard syntax also works
```

## Current Date/Time

```sql
SELECT today()                                     -- Date
SELECT now()                                       -- DateTime
```

## -If Combinators (Conditional Aggregation)

**Unique to ClickHouse.** More efficient than CASE WHEN:

```sql
SELECT
  sumIf(amount, status = 'active'),
  countIf(status = 'done'),
  avgIf(amount, region = 'US')
FROM t
```

## uniq() for Approximate Count Distinct

```sql
SELECT uniq(user_id)                               -- Fast approximate
SELECT uniqExact(user_id)                          -- Exact (slower)
SELECT count(DISTINCT user_id)                     -- Also works, but slower
```

## Safe Casting with OrNull / OrZero

```sql
SELECT toInt64OrNull(potentially_bad)              -- NULL on failure
SELECT toInt64OrZero(potentially_bad)              -- 0 on failure
SELECT toDateOrNull(string_col)
```

## Arrays (1-Indexed)

```sql
SELECT arr[1] AS first_element                     -- 1-indexed!
SELECT length(arr)
SELECT has(arr, value)                             -- Membership test
SELECT indexOf(arr, value)                         -- Position (0 if not found)

-- Lambda functions
SELECT arrayFilter(x -> x > 5, arr)
SELECT arrayMap(x -> x * 2, arr)
```

## ARRAY JOIN (Not UNNEST)

```sql
-- Expand array to rows
SELECT id, element FROM t ARRAY JOIN arr AS element

-- With index
SELECT id, element, idx
FROM t ARRAY JOIN arr AS element, arrayEnumerate(arr) AS idx
```

## String Aggregation

```sql
SELECT arrayStringConcat(groupArray(name), ', ')
FROM t GROUP BY category
```

## LIMIT BY (Top N Per Group)

Unique clause for limiting within groups without window functions:

```sql
SELECT * FROM products
ORDER BY category, price DESC
LIMIT 3 BY category
```

## PREWHERE (Filter Before Reading)

More efficient than WHERE for selective filters:

```sql
SELECT * FROM events
PREWHERE event_date = '2024-01-15'
WHERE event_type = 'click'
```

## WITH FILL (Fill Gaps in Time Series)

```sql
SELECT toDate(dt) AS day, count() AS events
FROM events GROUP BY day
ORDER BY day WITH FILL
  FROM '2024-01-01' TO '2024-01-31'
  STEP INTERVAL 1 DAY
```

## SAMPLE (Random Sampling)

```sql
SELECT * FROM events SAMPLE 0.1                    -- 10% sample
SELECT * FROM events SAMPLE 10000                  -- ~10000 rows
```

## Nullable Types

ClickHouse distinguishes `Nullable(T)` from `T`. Use explicitly:

```sql
SELECT CAST(col AS Nullable(Int64))
SELECT ifNull(nullable_col, 'default')
SELECT assumeNotNull(col)                          -- Removes Nullable wrapper
```

## Tuples

```sql
SELECT (1, 'Alice', 3.14) AS person
SELECT person.1, person.2                          -- 1-indexed access
```

## JSON Extraction

```sql
SELECT JSONExtractString(json_col, 'key')
SELECT JSONExtractInt(json_col, 'nested', 'value') -- Path as multiple args
SELECT JSON_VALUE(json_col, '$.key')               -- JSONPath syntax
```

## No QUALIFY - Use Subquery

```sql
SELECT * FROM (
  SELECT *, row_number() OVER (PARTITION BY category ORDER BY amount DESC) AS rn
  FROM sales
) WHERE rn = 1
```
