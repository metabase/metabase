# SQL in the IR

An aggregation's `expr`, a dimension's or key's `expr`, a derived metric's arithmetic and a filter may be SQL in the
warehouse's dialect. The OSS `sql-to-mbql` module converts each to Lib clauses, parsing it with sqlglot in the dialect
of the config's `:driver`. [Its README](../../../../../src/metabase/sql_to_mbql/README.md) lists the subset of SQL that
converts, [what does not](../../../../../src/metabase/sql_to_mbql/README.md#what-does-not-convert) and what it would
take, and the one construct that converts with a difference for nulls. What is the import's own is in `sql.clj`:

- an `expr` that is a bare column name (quoted or not, perhaps table-qualified), a literal or `*` is read as it is
  written, without parsing (`parse-expr`); anything else is SQL;
- SQL that still contains Jinja (`{{`, `{%` or `{#`, inside a string literal too) is reported before it is parsed: dbt
  renders the template before the warehouse sees the SQL, so the text is not what runs;
- what the converter cannot convert is reported, naming the construct, under the metric or dimension the SQL belongs
  to (see [The report](report.md)).

A column's ref has the type the project gives the column, and a column the project does not type is a ref of unknown
type. The converter trusts one of those as a boolean in a condition, and does not take it to be an integer, so a
project that types its columns gets the integer-division and boolean-condition checks the README describes.

In a filter, an identifier that is one of the filter's placeholders resolves to what its reference names (see
`::ir/reference`): a dimension of the metric's table, of a table one of its joins leads to, or the metric's time
dimension, perhaps bucketed by a grain, or a key of the metric's table. A dimension whose `expr` is SQL is inlined, so
it can be filtered on even though it cannot be a curated dimension; a reference through a join that cannot be made
reports the metric, since the filter cannot be written. Any other identifier is a column of the metric's table, by
name. In a derived metric's `expr`, an identifier is one of the metric's inputs, by alias or name.

## Weeks

A semantic layer's `week` grain, and `date_trunc('week', ...)` on most warehouses, is the ISO week, which starts on
Monday. A Metabase `week` starts on the day the instance's "First day of the week" setting names (Sunday by default), so
a metric filtered or broken out by week agrees with the source only on an instance set to Monday. The import reads
`week` as the Metabase unit wherever it is written (a reference's grain, a `date_trunc('week', ...)` in a filter or in
an aggregation's `expr`), and puts a note on the metric in the report's `:converted` entry saying so (see [The
report](report.md)); `extract(dow ...)` and `extract(week ...)` are reported for the same reason. A grain is read with
the converter's `truncation-unit`, so a grain and `date_trunc` accept the same units.
