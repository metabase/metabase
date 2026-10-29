# SQL in the IR

An aggregation's `expr`, a dimension's or key's `expr`, a derived metric's arithmetic and a filter may be SQL in the
warehouse's dialect. Each goes through sqlglot (`metabase.sql-parsing.core/parse-expression`, used by `sql.clj`), which
parses an expression on its own in the dialect of the config's `:driver`, and a subset of SQL maps onto MBQL:

- column references, literals (numbers, strings, `TRUE` and `FALSE`, and `NULL` as a value, as in `nullif(x, NULL)`),
  unary minus, `+ - * /` and `^`, comparisons, `AND`/`OR`/`NOT`, `IN` and `NOT IN` over a list of values, `BETWEEN`
  and `NOT BETWEEN`. A negation leaves the null rows out, as SQL does: `!=` is `[:not [:= ...]]` and `NOT IN` is
  `[:not [:in ...]]`, never Lib's `!=` and `not-in`, which Metabase compiles to `x <> v OR x IS NULL`, and a negated
  `LIKE` or regex match (below) is conjoined with `IS NOT NULL`. A comparison, `IN`, `BETWEEN` or simple `CASE x WHEN`
  with a `NULL` literal as an operand is reported: in SQL it is null, so never true, while the `[:= x nil]` it would
  become is a null check that matches the null rows. A `/` of two
  known integers is reported on the warehouses that truncate the quotient (Postgres, SQL Server, Redshift,
  Presto/Trino, SQLite), since Metabase's `/` does not; a bare column as a condition (`WHERE is_returned`) is
  `column = true`, and is reported when the project types the column as anything but boolean (see the table below for
  both);
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
  import does not know, a pattern with a backslash is reported. A `%x%`, `x%`, `%x` or `x%y` pattern, or
  one literal with a run of `_`, is `contains`, `starts-with` or `ends-with` (and `length` where the pattern pins one),
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
  (`millisecond` through `year`, the same units a grain on a reference takes), which is the column bucketed by that
  unit.

Anything outside that subset is reported, naming the construct. In a filter, an identifier that is one of the filter's
placeholders resolves to what its reference names (see `::ir/reference`): a dimension of the metric's table, of a table
one of its joins leads to, or the metric's time dimension, perhaps bucketed by a grain, or a key of the metric's table.
A dimension whose `expr` is SQL is inlined, so it can be filtered on even though it cannot be a curated dimension; a
reference through a join that cannot be made reports the metric, since the filter cannot be written. Any other
identifier is a column of the metric's table, by name.

## Weeks

A semantic layer's `week` grain, and `date_trunc('week', ...)` on most warehouses, is the ISO week, which starts on
Monday. A Metabase `week` starts on the day the instance's "First day of the week" setting names (Sunday by default), so
a metric filtered or broken out by week agrees with the source only on an instance set to Monday. The import reads
`week` as the Metabase unit wherever it is written (a reference's grain, a `date_trunc('week', ...)` in a filter or in
an aggregation's `expr`), and puts a note on the metric in the report's `:converted` entry saying so (see [The
report](report.md)); `extract(dow ...)` and `extract(week ...)` are reported for the same reason.

## What does not convert

What the subset leaves out, and what it would take:

| SQL | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| a function with no MBQL expression function of the same meaning | `greatest(a, b)`, `regexp_replace(x, 'a', 'b')`, `to_char(d, 'YYYY')`, `ln(x)`, `log(2, x)`, `dateadd(day, 1, d)`, `extract(dow from d)`, `trim('x' from s)`, `round(x, -1)`, `round(x, 19)`, `date_trunc('decade', d)`, `date_trunc('month', d + 1)` | The functions that have an MBQL expression function with the same meaning are mapped (the list is above); the rest have nothing to map onto. `round` to a number of decimals is `round(x * 10^n) / 10^n`, so the decimals have to be a literal. `date_trunc` is a temporal bucket on a column ref, so there is nothing to bucket when its argument is an expression, and nothing for a unit Metabase does not have. | Extend the import where MBQL has an equivalent under another shape (`dateadd` as `datetime-add`, `greatest` as a `case`); extend MBQL with the rest (a regex replace, a date format, a natural log, week and day-of-week extraction that agrees on the first day of the week). |
| a `CAST` to anything but an integer, decimal, float, text, date or timestamp type | `cast(x as boolean)`, `x::uuid`, `cast(x as interval)` | MBQL's conversions are `integer`, `float`, `text`, `date` and `datetime`, and the common SQL spellings of those types map onto them (`cast(amount_cents as decimal) / 100` converts on Postgres). | Extend MBQL with the missing conversions. |
| a `CAST` to a decimal with a scale, or to a bare `DECIMAL` where that is a scale-0 type | `cast(x as numeric(10, 2))`, `x::decimal(12)`, `cast(x as decimal)` on MySQL, SQL Server, Oracle, Redshift, Snowflake, Spark/Databricks or Trino | The warehouse rounds the value to the scale (`DECIMAL(10, 2)` to two decimals, a bare `DECIMAL` to none everywhere but Postgres, where it is unconstrained, BigQuery, where `NUMERIC` has nine, and SQLite, which has no fixed point), and MBQL's `float` conversion keeps every digit, so the number would silently differ. | Extend MBQL with a conversion to a decimal of a given scale, or convert `DECIMAL(p, s)` as `round(x * 10^s) / 10^s` where the warehouse's rounding mode is known. |
| a `CAST` to an integer where the warehouse truncates and Metabase rounds | `cast(x as int)` of a non-integer value on Spark/Databricks, SQLite, ClickHouse or Redshift (whose `enable_numeric_rounding` is off by default) | Those warehouses drop the fraction, where Metabase compiles its `integer` conversion there as `CAST(ROUND(x) AS BIGINT)`, so `2.7` is `2` to the warehouse and `3` to Metabase. A value already known to be an integer converts. | Write `floor(x)` in the project, or extend MBQL's `integer` conversion with a rounding mode. |
| a comparison, `IN`, `BETWEEN` or simple `CASE x WHEN` with a `NULL` literal as an operand | `status = NULL`, `status IN ('a', NULL)`, `case status when null then 1 end` | In SQL the comparison is null, so never true. Lib reads a nil operand of `=`, `!=` or `in` as a null check, so `[:= x nil]` would match the null rows, the opposite of what was written. | Nothing: `IS [NOT] NULL` converts. |
| an integer divided by an integer, on a warehouse that truncates the quotient | `expr: quantity / 2`, `expr: amount_cents / 100` with an integer column, on Postgres, SQL Server, Redshift, Presto/Trino or SQLite | There `7 / 2` is `3`; Metabase's `/` divides as floats and gives `3.5`, so the number would silently differ. Both operands have to be known integers (a column the project does not type is not), and the warehouse has to be one that truncates: sqlglot knows which do, and MySQL, Snowflake, BigQuery, Oracle and Databricks divide as decimals, as Metabase does, so the same `expr` converts there. The inputs of a derived metric are `[:metric ...]` references of no known type, so `a / b` over two counts is not caught. | Cast an operand in the project (`quantity / 2.0`, `cast(amount_cents as decimal) / 100` converts); or extend MBQL with an integer division. |
| a non-boolean column standing alone as a condition | a filter that is just `status`, `case when status then 1 end` | A bare column in a boolean position is read as `column = true`, which is right for a boolean column (`WHERE is_returned`) and nothing else: the warehouse rejects an integer or text there, where `[:= x true]` would run and match nothing. A column the project types as anything but boolean is reported; one it does not type is trusted. | Nothing: this is a mistake in the project. |
| a `LIKE`, `SIMILAR TO` or regex pattern that is not a string literal | `like prefix \|\| '%'`, `~ pattern` | A pattern that is a column or an expression cannot be taken apart into Lib's string filters, and the regex fallback needs the regex as a literal too. | Extend MBQL with a `like` clause taking an expression as the pattern. |
| a `LIKE` pattern with a backslash and no `ESCAPE`, on a dialect whose default escape character the import does not know | `like '100\%'` on Druid, or with no `:driver` dialect | The pattern means `100%` where a backslash is the default escape character and `100\` followed by anything where it is not. The import knows the answer for Postgres, Redshift, MySQL, BigQuery, Spark/Databricks, Hive and ClickHouse (a backslash) and for Snowflake, SQL Server, Oracle, SQLite and Trino/Presto (none); elsewhere it reports rather than guess. A `[` in a SQL Server pattern, which opens a character class, is reported too. | Write `ESCAPE` in the project, or add the dialect to the import's table. |

## Concatenation and nulls

One construct converts with a difference in what it returns for nulls. `a || b` in an aggregation's `expr` or a filter
becomes Metabase's `concat`, which the SQL drivers (SQLite's aside) compile to the warehouse's `CONCAT()` function. On
Postgres, `CONCAT()` treats a null argument as an empty string where `||` yields null, so `count_distinct(status ||
code)` counts a row whose `code` is null, under its `status` alone, where the source's `count(distinct ...)` skips the
null `||` gives it; a filter on `a || b` can likewise match rows the SQL would not. On warehouses whose `CONCAT()`
propagates nulls as `||` does, Redshift, Snowflake, BigQuery and Databricks among them, the two agree. The fix belongs
in Metabase: a `:concat` option that compiles to null-propagating concatenation; until then the import keeps `concat`.
