## Syntax

A custom expression is one spreadsheet-like formula. There is no `=` in front of it.

- Column: the column name in square brackets, copied exactly from the column list: `[Total]`, `[Product → Category]`. Inside brackets, write `]` as `\]`.
- Text: in double or single quotes: `"Gadget"`, `'it\'s'`. Use a backslash to escape a quote.
- Number: `42`, `3.14`, `-1`, `1e6`.
- Boolean: `True`, `False`.
- Date: an ISO string, `"2024-01-31"` or `"2024-01-31T12:00:00"`. A comparison with a date column converts it.
- There is no null literal. Use `isNull`, `notNull`, `isEmpty`, `notEmpty` and `coalesce`.
- Arithmetic: `+ - * /` on numbers. Use parentheses to group.
- Comparison: `= != < <= > >=`.
- Logic: `AND`, `OR`, `NOT`. The operands must be booleans.
- Function call: `name(arg1, arg2)`. Function names are case-insensitive.

## Modes

- `expression`: a custom column. It computes one value for each row. It cannot use aggregations.
- `filter`: a condition. It must return a boolean. Only the rows where it is true are kept.
- `aggregation`: a summary of many rows into one value, for each group of the "Group by" step. It must use at least one aggregation function. You can combine aggregations with arithmetic, for example `Sum([Total]) / Count()`.

## What expressions cannot do

These are not possible in a custom expression. Other steps of the query builder do some of them.

- Read values from other rows of the table, for example SQL `LAG`, `LEAD`, `ROW_NUMBER`, `RANK` or a running total in a custom column. In aggregation mode only, `Offset`, `CumulativeSum` and `CumulativeCount` work across the rows of the grouped result.
- Join, look up or query other tables (SQL subqueries and joins, Excel `VLOOKUP`, `XLOOKUP`, `INDEX`/`MATCH`). The query builder has a Join step for this. A column of a joined or linked table is available only when it is in the column list.
- Group, sort, limit or deduplicate rows (`GROUP BY`, `ORDER BY`, `LIMIT`, `DISTINCT`). These are other query builder steps.
- Format dates or numbers with a pattern (SQL `TO_CHAR`, `FORMAT`, Excel `TEXT(A1, "mmm yyyy")`). Only `monthName`, `quarterName`, `dayName` and `text` exist.
- Modulo, trigonometry, natural logarithm, `GREATEST`/`LEAST`, `NULLIF`, `ROUND(x, digits)`, random numbers. `log` is base 10. Write `round(x * 100) / 100` to round to 2 decimals. Write `case` for `GREATEST`, `LEAST` and `NULLIF`.
- Pattern matching with wildcards (`LIKE '%a_b%'`). Use `contains`, `startsWith`, `endsWith`, or `regexExtract`.
- Subtract dates with `-`. Use `datetimeDiff`, `datetimeAdd` and `datetimeSubtract`.

## Converting SQL and spreadsheet formulas

The user can paste a SQL fragment or a spreadsheet formula. Convert it only when the expression language can do all of it. Map table columns and spreadsheet cell references (`A2`, `B:B`, `Sheet1!C2`) to the columns in the column list by their meaning. A whole-column range in a spreadsheet aggregation (`SUM(B:B)`) means the whole column. Text in SQL single quotes becomes an expression string.

| SQL | Spreadsheet | Expression |
| --- | --- | --- |
| `CASE WHEN c1 THEN v1 WHEN c2 THEN v2 ELSE v3 END` | `IF(c1, v1, IF(c2, v2, v3))`, `IFS(c1, v1, c2, v2)` | `case(c1, v1, c2, v2, v3)` |
| `COALESCE(a, b, 'x')`, `IFNULL`, `NVL` | `IF(ISBLANK(A2), B2, A2)`, `IFERROR` on blanks | `coalesce([A], [B], "x")` |
| `a IS NULL`, `a IS NOT NULL` | `ISBLANK(A2)`, `ISNA(A2)` | `isNull([A])`, `notNull([A])` |
| `a = '' OR a IS NULL` | `A2 = ""` | `isEmpty([A])` |
| `a IN (1, 2)`, `a NOT IN (1, 2)` | `OR(A2 = 1, A2 = 2)` | `in([A], 1, 2)`, `notIn([A], 1, 2)` |
| `a BETWEEN x AND y` | `AND(A2 >= x, A2 <= y)` | `between([A], x, y)` |
| `a AND b`, `a OR b`, `NOT a` | `AND(a, b)`, `OR(a, b)`, `NOT(a)` | `a AND b`, `a OR b`, `NOT a` |
| `<>` | `<>` | `!=` |
| `CONCAT(a, ', ', b)`, `a \|\| b` | `CONCATENATE(A2, B2)`, `A2 & B2` | `concat([A], ", ", [B])` |
| `SUBSTRING(a, 9, 3)` | `MID(A2, 9, 3)` | `substring([A], 9, 3)` |
| `LEFT(a, 3)` | `LEFT(A2, 3)` | `substring([A], 1, 3)` |
| `LENGTH(a)` | `LEN(A2)` | `length([A])` |
| `UPPER`, `LOWER`, `TRIM` | `UPPER`, `LOWER`, `TRIM` | `upper`, `lower`, `trim` |
| `REPLACE(a, 'x', 'y')` | `SUBSTITUTE(A2, "x", "y")` | `replace([A], "x", "y")` |
| `SPLIT_PART(a, '-', 2)` | `INDEX(SPLIT(A2, "-"), 2)` | `splitPart([A], "-", 2)` |
| `a LIKE '%x%'`, `ILIKE` | `ISNUMBER(SEARCH("x", A2))` | `contains([A], "x")`, `contains([A], "x", "case-insensitive")` |
| `a LIKE 'x%'`, `a LIKE '%x'` | `LEFT(A2, 1) = "x"` | `startsWith([A], "x")`, `endsWith([A], "x")` |
| `REGEXP_SUBSTR`, `SUBSTRING(a, 'regex')` | `REGEXEXTRACT(A2, "regex")` | `regexExtract([A], "regex")` |
| `CAST(a AS INTEGER)`, `CAST(a AS FLOAT)` | `VALUE(A2)` | `integer([A])`, `float([A])` |
| `CAST(a AS TEXT)` | `TEXT(A2, "0")` | `text([A])` |
| `CAST(a AS DATE)` | `DATEVALUE(A2)` | `date([A])` |
| `ROUND(a)`, `CEIL`, `FLOOR`, `ABS`, `SQRT`, `POWER(a, 2)`, `EXP` | `ROUND(A2, 0)`, `ROUNDUP`, `ROUNDDOWN`, `ABS`, `SQRT`, `POWER`, `EXP` | `round`, `ceil`, `floor`, `abs`, `sqrt`, `power([A], 2)`, `exp` |
| `a + INTERVAL '14 days'` | `A2 + 14`, `EDATE(A2, 1)` | `datetimeAdd([A], 14, "day")`, `datetimeAdd([A], 1, "month")` |
| `a - INTERVAL '30 minutes'` | `A2 - 30/(60*24)` | `datetimeSubtract([A], 30, "minute")` |
| `DATEDIFF('day', a, b)`, `AGE` | `DATEDIF(A2, B2, "D")`, `B2 - A2` | `datetimeDiff([A], [B], "day")` |
| `EXTRACT(YEAR FROM a)`, `DATE_PART` | `YEAR(A2)`, `MONTH`, `DAY`, `HOUR`, `WEEKDAY`, `WEEKNUM` | `year([A])`, `month`, `day`, `hour`, `weekday`, `week` |
| `CURRENT_TIMESTAMP`, `NOW()`, `CURRENT_DATE` | `NOW()`, `TODAY()` | `now()`, `today()` |
| `a > CURRENT_DATE - INTERVAL '30 days'` | `A2 > TODAY() - 30` | `interval([A], -30, "day")` |
| `a AT TIME ZONE 'UTC' AT TIME ZONE 'EST'` | | `convertTimezone([A], "America/New_York", "UTC")` |
| `COUNT(*)`, `COUNT(DISTINCT a)` | `COUNTA(A:A)`, `COUNTUNIQUE(A:A)` | `Count()`, `Distinct([A])` |
| `SUM`, `AVG`, `MIN`, `MAX` | `SUM`, `AVERAGE`, `MIN`, `MAX` | `Sum`, `Average`, `Min`, `Max` |
| `COUNT(CASE WHEN c THEN 1 END)` | `COUNTIF(B:B, "x")`, `COUNTIFS` | `CountIf(c)` |
| `SUM(CASE WHEN c THEN a ELSE 0 END)` | `SUMIF(B:B, "x", A:A)`, `SUMIFS` | `SumIf([A], c)` |
| `AVG(CASE WHEN c THEN 1.0 ELSE 0 END)` | `COUNTIF(...) / COUNTA(...)` | `Share(c)` |
| `PERCENTILE_CONT(0.9)`, `MEDIAN` | `PERCENTILE(A:A, 0.9)`, `MEDIAN` | `Percentile([A], 0.9)`, `Median([A])` |
| `STDDEV`, `VARIANCE` | `STDEV`, `VAR` | `StandardDeviation([A])`, `Variance([A])` |
| `LAG(SUM(a)) OVER (ORDER BY …)` (aggregation mode) | | `Offset(Sum([A]), -1)` |
| `SUM(SUM(a)) OVER (ORDER BY …)` (aggregation mode) | | `CumulativeSum([A])` |

A SQL `WHERE` clause converts to a filter expression. A SQL `SELECT` item with an aggregation converts to an aggregation expression; its `GROUP BY` is a separate query builder step. A spreadsheet `COUNTIF(range, ">5")` criterion becomes a comparison: `CountIf([A] > 5)`.
