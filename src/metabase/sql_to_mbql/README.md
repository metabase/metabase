# SQL to MBQL

The `sql-to-mbql` module converts SQL in a warehouse's dialect to MBQL, as Lib clauses. For now it converts one SQL
expression on its own, with no surrounding `SELECT`: a computed column or a filter's condition, such as `sales / target`
or `status = 'Shipped' AND amount > 0`, or an aggregate expression, the shape a semantic layer's metric takes, such as
`SUM(net_amount) / COUNT(DISTINCT order_id)`. A whole query, with its `FROM`, joins and `GROUP BY`, does not convert.

## Usage

The API is `metabase.sql-to-mbql.core`:

```clojure
(require '[metabase.sql-to-mbql.core :as sql-to-mbql])

;; a value: a Lib expression, or a literal as itself
(sql-to-mbql/value->mbql "postgres" "sales / nullif(quantity, 0)" resolve-column)

;; a condition: a Lib filter clause
(sql-to-mbql/condition->mbql "postgres" "status = 'Shipped' AND amount > 0" resolve-column)

;; an aggregate expression: one Lib aggregation clause
(sql-to-mbql/aggregation->mbql "postgres" "SUM(amount) FILTER (WHERE status = 'Shipped') / COUNT(DISTINCT order_id)"
                               resolve-column)
```

- The dialect is a sqlglot dialect name, which `metabase.sql-tools.core/driver->dialect` gives for a driver, or nil for
  sqlglot's default. Some SQL means different things on different warehouses, and is read in the dialect's terms (see
  below).
- `resolve-column` is called with each column name as the SQL writes it, unquoted and without a table qualifier, and
  returns the Lib ref for the column. A column used twice is resolved twice, and each call has to return a new ref,
  since every ref carries its own `:lib/uuid`. The ref's type matters: an integer division, a cast to an integer and a
  bare column in a condition are read by it (see below), and a ref of type `:type/*` is a column of unknown type.
- `condition->mbql` reads the SQL where SQL expects a boolean (a `WHERE`, a `WHEN`) and returns a filter clause; a bare
  boolean column there is `column = true`. `aggregation->mbql` reads it as an aggregate expression and returns one
  aggregation clause, in which every column is inside an aggregate (see "Aggregations" below). `value->mbql` reads it as
  a value, which a comparison is not, nor is an aggregate.

SQL outside the subset below throws an exception that `sql-to-mbql/unsupported?` recognises, whose message names the
construct and says why. The converter reports rather than approximates: where the Lib clause would return other rows
or other numbers than the warehouse returns for the SQL, it throws. `sql-to-mbql/truncation-unit` reads a temporal unit
name the way `date_trunc` does, for a caller with unit names of its own (a semantic layer's time grains, say).

The SQL is parsed by sqlglot, through `metabase.sql-parsing.core/parse-expression`, and `expression.clj` builds the
clauses from its tree. `metabase-enterprise.semantic-layer-import` is the module's first user.

## What converts

- column references, literals (numbers, strings, `TRUE` and `FALSE`, and `NULL` as a value, as in `nullif(x, NULL)`),
  unary minus, `+ - * /` and `^`, comparisons, `AND`/`OR`/`NOT`, `IN` and `NOT IN` over a list of values, `BETWEEN`
  and `NOT BETWEEN`. A negation leaves the null rows out, as SQL does: `!=` is `[:not [:= ...]]` and `NOT IN` is
  `[:not [:in ...]]`, never Lib's `!=` and `not-in`, which Metabase compiles to `x <> v OR x IS NULL`, and a negated
  `LIKE` or regex match (below) is conjoined with `IS NOT NULL`. A comparison, `IN`, `BETWEEN` or simple `CASE x WHEN`
  with a `NULL` literal as an operand is reported: in SQL it is null, so never true, while the `[:= x nil]` it would
  become is a null check that matches the null rows. A `/` of two known integers is reported on the warehouses that
  truncate the quotient (Postgres, SQL Server, Redshift, Presto/Trino, SQLite), since Metabase's `/` does not; a bare
  column as a condition (`WHERE is_returned`) is `column = true`, and is reported when its ref is typed as anything but
  boolean (see the table below for both);
- `IS [NOT] NULL`, `IS [NOT] TRUE` and `IS [NOT] FALSE`, the negated boolean forms as `!= ... OR IS NULL` so that
  they still hold for a null column;
- `IS [NOT] DISTINCT FROM`, the null-safe comparison. Against a literal it is `=` or `!=`: `=` is null, so false in a
  filter, for a null column, and Metabase compiles `!=` on a column to include the nulls (on an expression it does
  not, so `OR IS NULL` is added). Between two columns it is spelled out over `IS NULL` checks with every branch
  two-valued: `a IS NOT DISTINCT FROM b` is `(a IS NOT NULL AND b IS NOT NULL AND a = b) OR (a IS NULL AND b IS NULL)`
  and `a IS DISTINCT FROM b` is `(a IS NOT NULL AND b IS NOT NULL AND a != b) OR (a IS NULL AND b IS NOT NULL) OR
  (a IS NOT NULL AND b IS NULL)`. The longer form was chosen over `COALESCE(..., FALSE)` because it runs on warehouses
  with no boolean values (SQL Server, Oracle) too;
- `LIKE` and `ILIKE` with any literal pattern, with or without `ESCAPE`. Without one, a backslash is the escape
  character where the warehouse makes it one (Postgres, Redshift, MySQL, BigQuery, Spark/Databricks, Hive, ClickHouse)
  and a plain character where it does not (Snowflake, SQL Server, Oracle, SQLite, Trino/Presto); on a dialect the
  converter does not know, a pattern with a backslash is reported. A `%x%`, `x%`, `%x` or `x%y` pattern, or one
  literal with a run of `_`, is `contains`, `starts-with` or `ends-with` (and `length` where the pattern pins one),
  which read as what was written and run on any warehouse; a pattern with no wildcard is `=`, over `lower` for
  `ILIKE`. Any other pattern is the equivalent anchored regular expression through the regex fallback below, over
  `lower` with lower-cased literals for `ILIKE`;
- `SIMILAR TO`, and the regex operators `~`, `~*`, `!~`, `!~*` and `regexp_like`, through the regex fallback: MBQL has
  no regex filter, but the first match `regex-match-first` finds is null exactly when the regex does not match, so
  `[:not-null [:regex-match-first x regex]]` is one. The regex is wrapped in a group of its own, so that a group
  inside it cannot make the match null when the regex matches, and `~*` prefixes `(?i)`. A `SIMILAR TO` pattern is
  rewritten to POSIX form (`%` to `.*`, `_` to `.`, `.` made literal, the escape character honoured). This needs the
  warehouse driver to support regular expressions (the `:regex` feature; Postgres does, SQL Server does not), and
  `(?i)` to be understood where `~*` is used;
- both forms of `CASE`, with or without `ELSE`, the simple `CASE x WHEN v` as `CASE WHEN x = v`;
- `CAST` (and `::`) to an integer, decimal, float, text, date or timestamp type, as `integer`, `float`, `text`,
  `date` and `datetime`, where the warehouse keeps the digits the conversion does: a `DECIMAL(p, s)` rounds to `s`
  decimals and a bare `DECIMAL` is a scale-0 type on most warehouses (not Postgres, BigQuery or SQLite), and
  Spark/Databricks, SQLite, ClickHouse and Redshift drop the fraction on a cast to an integer where Metabase rounds
  it, so those are reported (see the table below);
- the functions with an MBQL expression function of the same meaning: `coalesce`, `nullif` (as the `CASE` it stands
  for; `x / NULLIF(y, 0)` is plain division, since Metabase's `/` already returns NULL for a zero divisor), `abs`,
  `floor`, `ceil`/`ceiling`, `round` (to a literal number of decimals, at most 18, as `round(x * 10^n) / 10^n`),
  `sqrt`, `exp`, `log` (base 10, as in Metabase; `ln` does not map), `power`, `lower`, `upper`,
  `trim`/`ltrim`/`rtrim` (of spaces), `length`/`char_length`, `replace`, `substring`/`substr`, `concat` and `||`,
  `extract`/`date_part` of `year`, `quarter`, `month`, `day`, `hour`, `minute` or `second`,
  `now()`/`current_timestamp`, `current_date`, and `date_trunc` over a column to a Metabase temporal unit
  (`millisecond` through `year`, the units `truncation-unit` reads), which is the column bucketed by that unit.

Anything outside that subset is reported, naming the construct.

### Aggregations

`aggregation->mbql` takes a SQL aggregate expression, and converts it to one Lib aggregation clause. Each
aggregate's argument is converted with the row-level subset above, so `SUM(price * (1 - discount))` and
`AVG(CAST(sal AS DOUBLE PRECISION))` convert, and what is reported at row level stays reported inside an aggregate.

- `SUM`, `AVG`, `MIN`, `MAX`, `MEDIAN`, `COUNT(DISTINCT x)` and `PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY x)` (with
  `p` a literal from 0 to 1; ordered `DESC`, the percentile `1 - p`, the same value), as `sum`, `avg`, `min`, `max`,
  `median`, `distinct` and `percentile`; `STDDEV_POP` and `VAR_POP` as `stddev` and `var`, which Metabase compiles to
  the population statistics. ClickHouse's `quantile(p)(x)`, Spark's `PERCENTILE(x, p)` and the Trino family's
  `approx_percentile(x, p)` are what Metabase's `percentile` compiles to there, and convert to it;
- `COUNT(*)`, `COUNT(t.*)`, `COUNT(1)` and `SUM(1)` as `count`, the row count; `COUNT(x)` as `count` over `x`, which
  compiles to `COUNT(x)`, the count of the rows where `x` is not null;
- a filtered aggregate, as `sum-where`, `count-where` or `distinct-where`, whether written with `FILTER (WHERE c)` or as
  the `CASE` idiom: `SUM(CASE WHEN c THEN x ELSE 0 END)` and `SUM(CASE WHEN c THEN x END)` are `sum-where`,
  `SUM(CASE WHEN c THEN 1 ELSE 0 END)`, `COUNT(CASE WHEN c THEN 1 END)`, `COUNT(*) FILTER (WHERE c)` and Snowflake's
  and BigQuery's `COUNT_IF(c)` are `count-where`, `COUNT(DISTINCT CASE WHEN c THEN x END)` is `distinct-where`, and
  `COUNT(CASE WHEN c THEN x END)` counts the rows where `c` holds and `x` is not null. `AVG(CASE WHEN c THEN 1 ELSE 0
  END)` is `share`, the fraction of rows `c` holds for. Any other `CASE` is aggregated as the value it is, and so is
  `IF(c, a, b)` (Snowflake's `IFF`), which is a `CASE` of one branch;
- arithmetic, `nullif`, `coalesce` and the functions of the row-level subset over aggregates, so that
  `SUM(a) / NULLIF(SUM(b), 0)`, `COALESCE(SUM(x), 0)` and `ROUND(SUM(a) / COUNT(*), 2)` are each one aggregation. The
  row-level checks apply between aggregates too: `SUM(quantity) / COUNT(*)` over an integer column is reported on a
  warehouse that truncates the quotient, and `SUM(x)::NUMBER` on Snowflake is a cast that rounds.

A column outside an aggregate (`SUM(price) + price`, or a metric naming another metric by its name), an expression with
no aggregate in it, an aggregate nested in another, a window function, and an aggregate Metabase has no exact
equivalent for are reported; the table below has each.

## Weeks

`date_trunc('week', ...)` on most warehouses truncates to the ISO week, which starts on Monday. A Metabase `week`
starts on the day the instance's "First day of the week" setting names (Sunday by default), so the converter's `week`,
Metabase's, agrees with the warehouse's only on an instance set to Monday. `truncation-unit` reads `week` as Metabase's
unit too. `extract(dow ...)` and `extract(week ...)` depend on the first day of the week as well, and are reported.

## What does not convert

What the subset leaves out, and what it would take:

| SQL | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| a function with no MBQL expression function of the same meaning | `greatest(a, b)`, `regexp_replace(x, 'a', 'b')`, `to_char(d, 'YYYY')`, `ln(x)`, `log(2, x)`, `dateadd(day, 1, d)`, `extract(dow from d)`, `trim('x' from s)`, `round(x, -1)`, `round(x, 19)`, `date_trunc('decade', d)`, `date_trunc('month', d + 1)` | The functions that have an MBQL expression function with the same meaning are mapped (the list is above); the rest have nothing to map onto. `round` to a number of decimals is `round(x * 10^n) / 10^n`, so the decimals have to be a literal. `date_trunc` is a temporal bucket on a column ref, so there is nothing to bucket when its argument is an expression, and nothing for a unit Metabase does not have. | Extend the converter where MBQL has an equivalent under another shape (`dateadd` as `datetime-add`, `greatest` as a `case`); extend MBQL with the rest (a regex replace, a date format, a natural log, week and day-of-week extraction that agrees on the first day of the week). |
| a `CAST` to anything but an integer, decimal, float, text, date or timestamp type | `cast(x as boolean)`, `x::uuid`, `cast(x as interval)` | MBQL's conversions are `integer`, `float`, `text`, `date` and `datetime`, and the common SQL spellings of those types map onto them (`cast(amount_cents as decimal) / 100` converts on Postgres). | Extend MBQL with the missing conversions. |
| a `CAST` to a decimal with a scale, or to a bare `DECIMAL` where that is a scale-0 type | `cast(x as numeric(10, 2))`, `x::decimal(12)`, `cast(x as decimal)` on MySQL, SQL Server, Oracle, Redshift, Snowflake, Spark/Databricks or Trino | The warehouse rounds the value to the scale (`DECIMAL(10, 2)` to two decimals, a bare `DECIMAL` to none everywhere but Postgres, where it is unconstrained, BigQuery, where `NUMERIC` has nine, and SQLite, which has no fixed point), and MBQL's `float` conversion keeps every digit, so the number would silently differ. | Extend MBQL with a conversion to a decimal of a given scale, or convert `DECIMAL(p, s)` as `round(x * 10^s) / 10^s` where the warehouse's rounding mode is known. |
| a `CAST` to an integer where the warehouse truncates and Metabase rounds | `cast(x as int)` of a non-integer value on Spark/Databricks, SQLite, ClickHouse or Redshift (whose `enable_numeric_rounding` is off by default) | Those warehouses drop the fraction, where Metabase compiles its `integer` conversion there as `CAST(ROUND(x) AS BIGINT)`, so `2.7` is `2` to the warehouse and `3` to Metabase. A value already known to be an integer converts. | Write `floor(x)` in the SQL, or extend MBQL's `integer` conversion with a rounding mode. |
| a comparison, `IN`, `BETWEEN` or simple `CASE x WHEN` with a `NULL` literal as an operand | `status = NULL`, `status IN ('a', NULL)`, `case status when null then 1 end` | In SQL the comparison is null, so never true. Lib reads a nil operand of `=`, `!=` or `in` as a null check, so `[:= x nil]` would match the null rows, the opposite of what was written. | Nothing: `IS [NOT] NULL` converts. |
| an integer divided by an integer, on a warehouse that truncates the quotient | `quantity / 2`, `amount_cents / 100` with an integer column, on Postgres, SQL Server, Redshift, Presto/Trino or SQLite | There `7 / 2` is `3`; Metabase's `/` divides as floats and gives `3.5`, so the number would silently differ. Both operands have to be known integers (a ref of unknown type is not), and the warehouse has to be one that truncates: sqlglot knows which do, and MySQL, Snowflake, BigQuery, Oracle and Databricks divide as decimals, as Metabase does, so the same SQL converts there. A ref of no known type, such as a `[:metric ...]` reference, is not caught: `a / b` over two counts converts. | Cast an operand in the SQL (`quantity / 2.0`, `cast(amount_cents as decimal) / 100` converts); or extend MBQL with an integer division. |
| a non-boolean column standing alone as a condition | a condition that is just `status`, `case when status then 1 end` | A bare column in a boolean position is read as `column = true`, which is right for a boolean column (`WHERE is_returned`) and nothing else: the warehouse rejects an integer or text there, where `[:= x true]` would run and match nothing. A column whose ref is typed as anything but boolean is reported; one of unknown type is trusted. | Nothing: this is a mistake in the SQL. |
| a `LIKE`, `SIMILAR TO` or regex pattern that is not a string literal | `like prefix \|\| '%'`, `~ pattern` | A pattern that is a column or an expression cannot be taken apart into Lib's string filters, and the regex fallback needs the regex as a literal too. | Extend MBQL with a `like` clause taking an expression as the pattern. |
| a `LIKE` pattern with a backslash and no `ESCAPE`, on a dialect whose default escape character the converter does not know | `like '100\%'` on Druid, or with no dialect | The pattern means `100%` where a backslash is the default escape character and `100\` followed by anything where it is not. The converter knows the answer for Postgres, Redshift, MySQL, BigQuery, Spark/Databricks, Hive and ClickHouse (a backslash) and for Snowflake, SQL Server, Oracle, SQLite and Trino/Presto (none); elsewhere it reports rather than guess. A `[` in a SQL Server pattern, which opens a character class, is reported too. | Write `ESCAPE` in the SQL, or add the dialect to the converter's table (`default-like-escape`). |
| a column outside an aggregate, in an aggregation | `SUM(price) + price`, `total_amount / order_count` where those are other metrics' names, `CASE WHEN status = 'x' THEN SUM(amount) END` | An aggregation has one value per group, and a column has one per row, so a column outside an aggregate has no one value. A semantic layer's metric that names another metric arrives this way, since the converter sees identifiers only. | Inline the metric it names, as the semantic layer import does with a field's expression; or extend the import with `[:metric ...]` references for names it knows to be metrics. |
| an aggregation with no aggregate in it | `100`, `1 + 1`, `NULL` | It is a value, not an aggregation. | Nothing: this is a mistake in the SQL. |
| an aggregate nested in another, in its argument or its `FILTER` | `SUM(MAX(price))`, `SUM(CASE WHEN c THEN MAX(x) END)`, `SUM(x) FILTER (WHERE COUNT(*) > 1)` | Nesting aggregates has no meaning in one query; a warehouse rejects it. | Nothing. |
| a window function | `SUM(SUM(x)) OVER (ORDER BY d)`, `RANK() OVER (PARTITION BY s ORDER BY SUM(x) DESC)`, `SUM(x) - LAG(SUM(x), 1) OVER (ORDER BY y, m)` | Its value depends on the other rows of the result, which one aggregation clause has no say over: a running total needs the query's own breakout as its ordering. Semantic layers write "cumulative" and period-over-period metrics this way. | Convert a `SUM(SUM(x)) OVER (ORDER BY ... ROWS UNBOUNDED PRECEDING)` to `cum-sum` where the ordering is the query's time breakout, and `LAG` to `offset`, once the caller supplies that breakout. |
| `FILTER (WHERE c)` over anything but a sum or a count | `AVG(x) FILTER (WHERE c)`, `MIN(x) FILTER (WHERE c)`, `MEDIAN(x) FILTER (WHERE c)`, `STDDEV_POP(x) FILTER (WHERE c)` | Metabase's filtered aggregations are `sum-where`, `count-where` and `distinct-where`; there is no filtered `avg`, `min`, `max`, `median`, `percentile` or `stddev`. | Convert `AVG(x) FILTER (WHERE c)` as `sum-where / count-where` over `c AND x IS NOT NULL`; extend MBQL with the rest. |
| a sample standard deviation or variance | `STDDEV(x)`, `STDDEV_SAMP(x)`, `VARIANCE(x)`, `VAR_SAMP(x)` | Metabase compiles `stddev` and `var` to `STDDEV_POP` and `VAR_POP`, the population statistics, which divide by n where the sample ones divide by n - 1, so the number would differ. `STDDEV_POP` and `VAR_POP` convert, and so does MySQL's `STDDEV`, which is the population one there (its `VARIANCE` is too, but arrives from the parser as the same node as `VAR_SAMP`, so it is reported). | Extend MBQL with sample statistics, or a population/sample option. |
| a standard deviation, variance, median or percentile on a warehouse Metabase has no such aggregation for | `STDDEV_POP(x)` on SQLite; `MEDIAN(x)` or `PERCENTILE_CONT(...)` on MySQL or SQLite | The driver does not support `stddev`, `var`, `median` or `percentile` there, so the metric would fail when it runs. | Add the aggregation to the driver. |
| an exact percentile on a warehouse where Metabase's is approximate | `MEDIAN(x)`, `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` on BigQuery, SQL Server, Presto, Trino or Athena | Metabase's `percentile` and `median` compile to `APPROX_QUANTILES`, `APPROX_PERCENTILE_CONT` or `approx_percentile` there, an estimate the exact SQL does not return. On the Trino family `approx_percentile(x, p)` itself converts, being the very function Metabase emits; ClickHouse's `quantile(p)(x)` and `median(x)`, and Spark's `PERCENTILE(x, p)`, convert the same way. | Exact percentiles in those drivers. |
| an approximate aggregate | `APPROX_COUNT_DISTINCT(x)`, `APPROX_PERCENTILE(x, 0.5)` elsewhere than the Trino family | It returns an estimate, where Metabase's `distinct` and `percentile` are exact, so the number would differ. | Convert to the exact aggregation where the caller accepts a different, exact number. |
| an average of integers on a warehouse that truncates it | `AVG(quantity)`, `AVG(CASE WHEN c THEN 1 ELSE 0 END)` on SQL Server or Redshift | There `AVG` of an integer column is an integer, the fraction dropped, where Metabase's `avg` casts to a float first and its `share` is a fraction, so the number would differ. | Cast the argument in the SQL (`AVG(CAST(quantity AS FLOAT))`, `1.0` and `0.0` in the share idiom). |
| a discrete percentile | `PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY x)` | It picks a value from the data, where Metabase's `percentile` compiles to `PERCENTILE_CONT`, which interpolates between two, so the number would differ. A `PERCENTILE_CONT` whose fraction is not a literal from 0 to 1 is reported too. | Extend MBQL's `percentile` with a discrete option. |
| `DISTINCT` under anything but `COUNT`, or a `COUNT` of several expressions | `SUM(DISTINCT x)`, `AVG(DISTINCT x)`, `COUNT(DISTINCT *)`, `COUNT(DISTINCT a, b)`, `COUNT(a, b)`, `SUM(*)` | Metabase has `distinct` and `distinct-where`, over one expression, and nothing else distinct; `*` is no value. | Extend MBQL with a distinct option on `sum` and `avg`, and a `distinct` over several expressions. |
| an aggregate function with no MBQL aggregation of the same meaning | `STRING_AGG(x, ',')`, `ARRAY_AGG(x)`, `BOOL_OR(x)`, `SAFE_DIVIDE(SUM(a), SUM(b))` on BigQuery, a UDF over an aggregate | As at row level: nothing to map onto. `SAFE_DIVIDE` is a function, not an aggregate, and `x / NULLIF(y, 0)` says the same thing in a way that converts. | Extend MBQL. |

## Filtered aggregates and empty groups

A filtered aggregate converts with a difference in what it returns for a group no row of which passes the filter.
`SUM(x) FILTER (WHERE c)` and `SUM(CASE WHEN c THEN x END)` are null there, and `SUM(CASE WHEN c THEN x ELSE 0 END)` is
0; the `sum-where` all three convert to compiles to `SUM(CASE WHEN c THEN x ELSE 0.0 END)`, so it is 0 for all three.
`count-where` compiles to `SUM(CASE WHEN c THEN 1 ELSE 0.0 END)`, which is 0 for a group with rows and null over no rows
at all, where SQL's `COUNT` is 0 either way; `distinct-where` agrees with its SQL, and `SUM(1)`, converted as `count`,
is 0 where the SQL is null over no rows at all. A metric card returns one of these numbers for an empty group where the
warehouse returns another, and the sum of the groups is the same.

## Concatenation and nulls

One construct converts with a difference in what it returns for nulls. `a || b` becomes Metabase's `concat`, which the
SQL drivers (SQLite's aside) compile to the warehouse's `CONCAT()` function. On Postgres, `CONCAT()` treats a null
argument as an empty string where `||` yields null, so a distinct count over `status || code` counts a row whose
`code` is null, under its `status` alone, where SQL's `count(distinct status || code)` skips the null `||` gives it; a
filter on `a || b` can likewise match rows the SQL would not. On warehouses whose `CONCAT()` propagates nulls as `||`
does, Redshift, Snowflake, BigQuery and Databricks among them, the two agree. The fix belongs in Metabase: a `:concat`
option that compiles to null-propagating concatenation; until then the converter uses `concat`.
