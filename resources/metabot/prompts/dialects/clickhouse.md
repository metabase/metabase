# ClickHouse SQL Dialect Instructions

ClickHouse is a columnar OLAP database optimized for analytics workloads. Follow these dialect-specific rules.

## Identifier Quoting

- Use **double quotes** or **backticks** for identifiers: `"column"`, `` `column` ``
- String literals use **single quotes**: `'string value'`
- Identifiers are **case-sensitive**

```sql
SELECT "Column-Name", `another column` FROM "my_table"
```

## Type System

ClickHouse has strict typing. Key types:

```sql
-- Integers: Int8, Int16, Int32, Int64, Int128, Int256
-- Unsigned: UInt8, UInt16, UInt32, UInt64, UInt128, UInt256
-- Floats: Float32, Float64
-- Decimal: Decimal(P, S), Decimal32(S), Decimal64(S), Decimal128(S)
-- Strings: String, FixedString(N)
-- Date/Time: Date, Date32, DateTime, DateTime64(precision, 'timezone')
-- Complex: Array(T), Tuple(T1, T2, ...), Map(K, V), Nullable(T), LowCardinality(T)
-- JSON: JSON (experimental), Object('json')
```

## String Operations

```sql
-- Concatenation: concat() function or || operator
SELECT concat(first_name, ' ', last_name)
SELECT first_name || ' ' || last_name

-- String functions
SELECT
  lower(name), upper(name),
  trim(name), trimLeft(name), trimRight(name),
  substring(name, 1, 3),                  -- 1-indexed
  length(name),                           -- Bytes
  lengthUTF8(name),                       -- Characters
  replace(name, 'old', 'new'),
  splitByChar(',', csv),                  -- Returns Array(String)
  splitByString(', ', csv),               -- Split by multi-char delimiter
  arrayStringConcat(arr, ', '),           -- Join array to string
  position(name, 'sub'),                  -- Find position (1-indexed)
  positionCaseInsensitive(name, 'sub'),
  reverse(name),
  leftPad(toString(num), 5, '0'),
  format('{} {}', first_name, last_name)  -- Python-style formatting

-- Pattern matching
SELECT * FROM t WHERE name LIKE 'A%'
SELECT * FROM t WHERE name ILIKE 'a%'             -- Case-insensitive
SELECT * FROM t WHERE match(name, '^[A-Z]')       -- Regex
SELECT * FROM t WHERE name REGEXP '^[A-Z]'        -- Synonym
SELECT extract(text, 'pattern')                   -- Extract first match
SELECT extractAll(text, 'pattern')                -- Extract all matches as array
SELECT replaceRegexpAll(text, 'pattern', 'repl')
```

## Date and Time

ClickHouse distinguishes `Date`, `DateTime`, and `DateTime64` types.

```sql
-- Current date/time
SELECT
  today(),                                -- Date
  now(),                                  -- DateTime
  now64(),                                -- DateTime64

-- Date truncation
SELECT
  toStartOfYear(dt), toStartOfQuarter(dt), toStartOfMonth(dt),
  toStartOfWeek(dt),                      -- Monday
  toStartOfDay(dt),
  toStartOfHour(dt), toStartOfMinute(dt), toStartOfSecond(dt),
  toMonday(dt),                           -- Explicit Monday
  toDate(dt),                             -- Truncate to Date
  date_trunc('month', dt)                 -- Standard syntax (also works)

-- Date arithmetic
SELECT
  dt + INTERVAL 7 DAY,
  dt - INTERVAL 1 MONTH,
  addDays(dt, 7), addMonths(dt, 1), addYears(dt, 1),
  subtractDays(dt, 7),
  dateDiff('day', start_date, end_date),  -- Difference in units
  dateDiff('month', start_date, end_date),
  age('day', start_date, end_date)        -- Same as dateDiff

-- Extraction
SELECT
  toYear(dt), toMonth(dt), toDayOfMonth(dt),
  toDayOfWeek(dt),                        -- 1=Monday, 7=Sunday
  toDayOfYear(dt),
  toHour(dt), toMinute(dt), toSecond(dt),
  toYYYYMM(dt),                           -- 202401
  toYYYYMMDD(dt),                         -- 20240115
  toUnixTimestamp(dt),                    -- Unix epoch

-- Formatting and parsing
SELECT
  formatDateTime(dt, '%Y-%m-%d %H:%M:%S'),
  formatDateTime(dt, '%F'),               -- ISO date
  parseDateTime('2024-01-15', '%Y-%m-%d'),
  parseDateTimeBestEffort('Jan 15, 2024'),  -- Auto-detect format
  toDateTime('2024-01-15 10:30:00'),
  toDate('2024-01-15')
```

## Type Casting

```sql
-- CAST syntax
SELECT CAST(string_col AS Int64)
SELECT CAST(string_col AS Float64)
SELECT CAST(string_col AS Date)
SELECT CAST(string_col AS Nullable(Int64))

-- to* functions (preferred, more explicit)
SELECT
  toInt64(string_col),
  toFloat64(string_col),
  toString(number_col),
  toDate(string_col),
  toDateTime(string_col),
  toDecimal64(string_col, 2),             -- With scale
  toUUID(string_col)

-- Safe casting (returns NULL or default on failure)
SELECT
  toInt64OrNull(potentially_bad),
  toInt64OrZero(potentially_bad),
  toDateOrNull(string_col)
```

## NULL Handling

```sql
SELECT
  coalesce(nullable_col, 'default'),
  ifNull(nullable_col, 'default'),        -- Two-argument version
  nullIf(col, ''),                        -- Returns NULL if col = ''
  isNull(col), isNotNull(col),            -- Returns 0/1
  assumeNotNull(col)                      -- Optimistic: removes Nullable wrapper
```

**Important**: ClickHouse distinguishes `Nullable(T)` from `T`. Non-nullable columns cannot contain NULL.

## Arrays

Arrays are first-class in ClickHouse with powerful operations.

```sql
-- Array literal
SELECT [1, 2, 3], array(1, 2, 3)

-- Array access (1-indexed!)
SELECT arr[1] AS first_element

-- Array functions
SELECT
  length(arr),
  arrayConcat(arr1, arr2),
  arrayPushBack(arr, element), arrayPushFront(element, arr),
  arrayPopBack(arr), arrayPopFront(arr),
  arraySlice(arr, 2, 3),                  -- Start at index 2, take 3 elements
  arrayReverse(arr),
  arraySort(arr), arrayReverseSort(arr),
  arrayDistinct(arr),
  arrayUniq(arr),                         -- Count unique
  has(arr, value),                        -- Membership test
  hasAll(arr, [1, 2]),                    -- Contains all
  hasAny(arr, [1, 2]),                    -- Contains any
  indexOf(arr, value),                    -- Position (0 if not found)
  arrayFirst(x -> x > 5, arr),            -- First matching lambda
  arrayFilter(x -> x > 5, arr),           -- Filter with lambda
  arrayMap(x -> x * 2, arr),              -- Transform with lambda
  arrayReduce('sum', arr),                -- Reduce with aggregate function
  arrayJoin(arr),                         -- Expand array to rows (special!)
  arrayZip(arr1, arr2)                    -- Zip into array of tuples

-- ARRAY JOIN (expand array to rows)
SELECT id, element
FROM t ARRAY JOIN arr AS element

SELECT id, element, idx
FROM t ARRAY JOIN arr AS element, arrayEnumerate(arr) AS idx  -- With index
```

**Critical**: `arrayJoin()` in SELECT vs `ARRAY JOIN` in FROM behave differently. `ARRAY JOIN` is a join type; `arrayJoin()` is a function that duplicates rows.

## Tuples

```sql
-- Tuple literal
SELECT (1, 'Alice', 3.14) AS person
SELECT tuple(1, 'Alice', 3.14)

-- Tuple access
SELECT person.1, person.2                 -- 1-indexed!
SELECT tupleElement(person, 1)

-- Named tuples
SELECT CAST((1, 'Alice') AS Tuple(id Int64, name String)) AS person
SELECT person.name, person.id
```

## JSON Handling

```sql
-- Extract from JSON string
SELECT
  JSONExtractString(json_col, 'key'),
  JSONExtractInt(json_col, 'nested', 'value'),     -- Path as arguments
  JSONExtractFloat(json_col, 'amount'),
  JSONExtractBool(json_col, 'active'),
  JSONExtractRaw(json_col, 'nested'),              -- Returns JSON string
  JSONExtractArrayRaw(json_col, 'items'),          -- Array of JSON strings
  JSONExtractKeys(json_col),                       -- Get keys
  JSONLength(json_col, 'items'),                   -- Array length
  JSON_VALUE(json_col, '$.key'),                   -- JSONPath syntax
  JSON_QUERY(json_col, '$.nested')

-- Check path exists
SELECT JSONHas(json_col, 'key')
```

## Window Functions

```sql
SELECT
  row_number() OVER (PARTITION BY cat ORDER BY amt DESC),
  rank() OVER w, dense_rank() OVER w,
  sum(amt) OVER (PARTITION BY cat),
  lag(amt, 1, 0) OVER (ORDER BY dt),
  lead(amt) OVER (ORDER BY dt),
  first_value(amt) OVER w,
  last_value(amt) OVER w,
  nth_value(amt, 2) OVER w,
  ntile(4) OVER (ORDER BY amt)
FROM t
WINDOW w AS (PARTITION BY cat ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
```

## Aggregation

ClickHouse has extensive aggregation functions with combinators.

```sql
SELECT
  count(), countDistinct(col),
  sum(amount), avg(amount),
  min(val), max(val),
  groupArray(col),                        -- Aggregate to array
  groupArrayDistinct(col),
  groupUniqArray(col),                    -- Unique values as array
  arrayStringConcat(groupArray(col), ', '),  -- String aggregation

  -- Approximate functions (faster for large data)
  uniq(col),                              -- Approximate count distinct
  uniqExact(col),                         -- Exact count distinct
  uniqCombined(col),                      -- Higher cardinality approx
  quantile(0.5)(amount),                  -- Median
  quantiles(0.25, 0.5, 0.75)(amount),     -- Multiple quantiles
  quantileTDigest(0.95)(amount),          -- T-digest algorithm
  topK(10)(col),                          -- Top K frequent values

  -- Conditional aggregates with -If combinator
  sumIf(amount, status = 'active'),
  countIf(status = 'done'),
  avgIf(amount, region = 'US'),

  -- Array aggregates with -Array combinator
  sumArray(arr_col),                      -- Sum elements across rows
  avgArray(arr_col)

FROM t GROUP BY category
```

**Important**: ClickHouse aggregate combinators (`-If`, `-Array`, `-Merge`, `-State`) are powerful. Use `sumIf` instead of `sum(CASE WHEN ...)`.

## Common Table Expressions

```sql
WITH
  active_users AS (
    SELECT * FROM users WHERE status = 'active'
  ),
  user_stats AS (
    SELECT user_id, count() AS order_count FROM orders GROUP BY user_id
  )
SELECT * FROM active_users a JOIN user_stats s USING (user_id)
```

## Special ClickHouse Clauses

### PREWHERE (filter before reading columns)
```sql
-- More efficient than WHERE for selective filters
SELECT * FROM events
PREWHERE event_date = '2024-01-15'
WHERE event_type = 'click'
```

### SAMPLE (random sampling)
```sql
SELECT * FROM events SAMPLE 0.1          -- 10% sample
SELECT * FROM events SAMPLE 10000        -- Approximately 10000 rows
```

### FINAL (deduplicate ReplacingMergeTree)
```sql
SELECT * FROM events FINAL               -- Apply merge logic
```

### LIMIT BY (limit per group)
```sql
-- Top 3 per category without window functions
SELECT * FROM products
ORDER BY category, price DESC
LIMIT 3 BY category
```

### WITH FILL (fill gaps in time series)
```sql
SELECT
  toDate(dt) AS day,
  count() AS events
FROM events
GROUP BY day
ORDER BY day WITH FILL
  FROM '2024-01-01' TO '2024-01-31'
  STEP INTERVAL 1 DAY
```

## Performance Considerations

### Partition Filtering
```sql
-- Good: filter on partition column
SELECT * FROM events WHERE event_date = '2024-01-15'

-- Bad: function on partition column
SELECT * FROM events WHERE toDate(event_datetime) = '2024-01-15'
```

### Use Approximate Functions
```sql
-- Faster: approximate count distinct
SELECT uniq(user_id) FROM events

-- Slower: exact count distinct
SELECT count(DISTINCT user_id) FROM events
```

### Avoid SELECT *
```sql
-- Good: select only needed columns (ClickHouse is columnar!)
SELECT user_id, event_type FROM events

-- Bad: reads all columns
SELECT * FROM events
```

## Common Patterns

### Safe Division
```sql
SELECT
  if(denominator = 0, 0, numerator / denominator),
  numerator / nullIf(denominator, 0)
```

### Conditional Aggregation
```sql
SELECT
  count() AS total,
  countIf(status = 'active') AS active_count,
  sumIf(amount, type = 'revenue') AS revenue
FROM t
```

### Date Spine Generation
```sql
SELECT arrayJoin(
  arrayMap(x -> toDate('2024-01-01') + x,
           range(toUInt32(dateDiff('day', '2024-01-01', '2024-12-31') + 1)))
) AS dt
```

## Key Differences from Other Dialects

| Feature | ClickHouse | PostgreSQL | BigQuery | MySQL |
|---------|------------|------------|----------|-------|
| Identifier quotes | `"double"` | `"double"` | `` `backtick` `` | `` `backtick` `` |
| Array index | 1-based | 1-based | 0-based | N/A |
| Date truncate | `toStartOfMonth` | `DATE_TRUNC` | `DATE_TRUNC` | `DATE_FORMAT` |
| Count distinct approx | `uniq()` | N/A | `APPROX_COUNT_DISTINCT` | N/A |
| Conditional agg | `sumIf()` | `FILTER (WHERE)` | `COUNTIF` | `SUM(CASE)` |
| String agg | `groupArray` + `arrayStringConcat` | `STRING_AGG` | `STRING_AGG` | `GROUP_CONCAT` |
| Array expand | `ARRAY JOIN` | `UNNEST` | `UNNEST` | N/A |
| Top K per group | `LIMIT BY` | Window func | `QUALIFY` | Window func |
