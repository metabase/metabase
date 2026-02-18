# Apache Druid Dialect - Key Differences

Druid is optimized for real-time analytics and time-series data.

## Critical Limitations

- **No JOINs** between Druid tables (only lookup/broadcast joins)
- **No RIGHT/FULL OUTER JOINs**
- **Subqueries only in FROM clause**
- **No UPDATE or DELETE**
- **`__time` column required** for most queries

## Identifier Quoting

Double quotes for identifiers. Case-sensitive.

```sql
SELECT "Column Name" FROM "my-datasource"
```

**Schema-qualified names:** Schema and datasource are SEPARATE identifiers. Quote each part individually if needed:

```sql
-- CORRECT: each identifier quoted separately
SELECT * FROM "druid"."My-Datasource"
SELECT * FROM druid.my_datasource         -- unquoted if no special chars

-- WRONG: quoting the whole path as one identifier
SELECT * FROM "druid.my_datasource"       -- Looks for datasource literally named "druid.my_datasource"
```

## Always Filter on __time

**CRITICAL: Always filter on `__time` for query performance.**

```sql
SELECT * FROM events
WHERE __time >= TIMESTAMP '2024-01-01'
  AND __time < TIMESTAMP '2024-02-01'
  AND status = 'active'
```

## TIME_FLOOR (Preferred over DATE_TRUNC)

Uses ISO 8601 period notation:

```sql
SELECT TIME_FLOOR(__time, 'P1D') AS day           -- P1D = 1 day
SELECT TIME_FLOOR(__time, 'PT1H') AS hour         -- PT1H = 1 hour
SELECT TIME_FLOOR(__time, 'P1M') AS month         -- P1M = 1 month
SELECT TIME_FLOOR(__time, 'P1D', NULL, 'America/New_York')  -- With timezone
```

**Period notation:** `P1D` (day), `P1W` (week), `P1M` (month), `P1Y` (year), `PT1H` (hour), `PT1M` (minute).

## TIME_SHIFT (Date Arithmetic)

```sql
SELECT TIME_SHIFT(__time, 'P1D', 1) AS next_day   -- Add 1 day
SELECT TIME_SHIFT(__time, 'P1D', -1) AS prev_day  -- Subtract
SELECT TIME_SHIFT(__time, 'PT1H', 2) AS plus_2h
```

## LATEST / EARLIEST (Temporal Aggregation)

Druid-specific functions to get first/last value by time:

```sql
SELECT
  user_id,
  LATEST(status) AS current_status,
  EARLIEST(status) AS first_status,
  LATEST_BY(amount, __time) AS last_amount
FROM events
WHERE __time >= TIMESTAMP '2024-01-01'
GROUP BY user_id
```

## APPROX_COUNT_DISTINCT

`COUNT(DISTINCT)` uses approximation by default:

```sql
SELECT APPROX_COUNT_DISTINCT(user_id)             -- HyperLogLog
SELECT APPROX_COUNT_DISTINCT_DS_HLL(user_id)      -- DataSketches HLL
```

## String Aggregation

```sql
SELECT STRING_AGG(name, ', ') FROM t GROUP BY category
SELECT LISTAGG(name, ', ') FROM t GROUP BY category   -- Alias
```

## LOOKUP Function

For joining with dimension/lookup tables:

```sql
SELECT LOOKUP(country_code, 'country_names') AS country_name
FROM events
```

## No QUALIFY - Use Subquery

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (ORDER BY amount DESC) AS rn
  FROM sales WHERE __time >= TIMESTAMP '2024-01-01'
) WHERE rn = 1
```
