# The IR

The IR (`schemas/ir.clj`) is the import's own model of a semantic layer, not any one tool's. It keeps the warehouse's
terms where they are the warehouse's (column names, type strings, SQL) and its own everywhere else:

| IR | What it is | dbt | Ossie | Cube, roughly |
| -- | -- | -- | -- | -- |
| table | A physical relation and what the semantic layer declares on it: documented columns, dimensions, named expressions, keys, joins | a semantic model | a dataset | a cube |
| relation | The table's database, schema and name, with the parts the project quoted; the schema may be missing | `node_relation`, `relation_name` | a dataset's `source` | `sql_table` |
| dimension | Something a metric can be broken out and filtered by: a column or SQL, `:categorical` or `:time`, a time one with a default grain | a dimension | a field with `dimension` | a dimension |
| expression | A named row-level expression of a table, a column or SQL, which a metric's SQL or a filter can refer to by name and which is inlined there; not a breakout | (a measure's `expr` is folded into the metric) | a field without `dimension` | a measure's `sql` |
| key | A named key of a table, a column or SQL, which a filter can refer to | an entity | a `primary_key` field | a primary key |
| join | A way from a table to another, through a column of the table, which Metabase follows as an implicit join | a foreign or unique entity, matched to the model keyed by it | a relationship | a join |
| alias | A name by which a reference can name a table itself | a model's primary entity | the dataset's own name | a cube's own name |
| metric | `:simple` (one aggregation over one table), `:cumulative` (its running total), `:ratio` or `:derived` (arithmetic over other metrics) | a metric, with its measure folded in | a metric, always `:simple` | a measure |
| aggregation | An operator over an expression, with SQL's meaning (see below); or a whole SQL aggregate expression with placeholders for its references (see below) | `agg` and `expr` | the metric's `expression` | a measure's `type` and `sql` |
| time dimension | The dimension a metric is measured along over time: its default dimension | `agg_time_dimension`, `metric_time` | the base dataset's one `is_time` field | a time dimension |
| time grain | A granularity by name: a Metabase temporal unit's, or the source's own | a granularity | (none) | a granularity |
| filter | SQL in the warehouse's dialect, with a placeholder for each reference to a dimension, expression, key or the time dimension | a `where_sql_template` with MetricFlow Jinja | (none: written inline as `CASE WHEN` or `FILTER`) | `filters`, segments |

A source does the work of putting what it says in those terms. dbt's, for example, works out its joins from entity
names (`dbt/joins.clj`), rewrites its Jinja filter templates into IR filters and reports the MetricFlow syntax they
cannot hold (`dbt/filters.clj`), and folds a legacy measure into the metric that uses it (`dbt/parse.clj`). Ossie's
finds the field references in a metric's SQL with sqlglot and stands placeholders in for them, choosing the base dataset
the metric is over (`ossie/metric_sql.clj`), and turns relationships into joins (`ossie/parse.clj`).

A column carries the warehouse type string the project declares (`data-type`) or, for a source whose types are
logical rather than the warehouse's (Ossie's `datatype`), the Metabase base type itself (`base-type`), which the resolve
stage takes first.

The IR holds metrics, the one kind of content an import carries today; see [Adding a kind of
content](extending.md#adding-a-kind-of-content) for another. The SQL it holds, and the subset of it that converts, is in
[SQL in the IR](sql.md).

A reference, the thing a placeholder in a filter's or a SQL aggregation's SQL stands for, is a dimension (through a
path of joins, perhaps bucketed by a grain), a named expression (through a path of joins), a key of the metric's table,
or the metric's time dimension (`::reference`). A dimension or expression reached with an empty path, or through one
of the table's aliases, is one of the table's own.

## Aggregations

An aggregation's operator is one of `:sum`, `:avg`, `:min`, `:max`, `:median`, `:percentile` (a continuous one, with
its fraction), `:count` (SQL's `COUNT`, which skips nulls), `:count-distinct` and `:count-where` (the rows where its
expression, a condition, holds). Its `expr` is a column, a literal or SQL; `:sum` or `:count` of `1`, or `:count` of
`*`, is a row count. The resolve stage maps them as follows:

| IR | Metabase |
| -- | -- |
| `:sum`, `:avg`, `:min`, `:max`, `:median` | `sum`, `avg`, `min`, `max`, `median` |
| `:percentile` | `percentile` with the same fraction |
| `:count` of a column or an expression | `count` over the expression, which compiles to `COUNT(x)` and skips nulls as SQL does |
| `:count`, `:sum` of `1`; `:count` of `*` | `count`, a row count |
| `:count-distinct` | `distinct` |
| `:count-where` of a condition, or a boolean column | `count-where` the condition, or the column being true |
| `fill-nulls-with` | the aggregation wrapped in `coalesce`; reported on a `:min` or `:max` of a non-numeric column |
| `:cumulative`, over a sum, a row count or a `:count` of a column | `cum-sum`, `cum-count`, or the `cum-sum` of a `case` that is 1 where the column is not null |
| `:ratio` | `/` of `[:metric ...]` references to the input metrics' cards |
| `:derived` | the arithmetic of its SQL over `[:metric ...]` references, by alias; `x / nullif(y, 0)` is `x / y` |
| an input with filters of its own | inlined as the filtered form of the input's aggregation, so the metric stays one card |

### Aggregations written as SQL

A format that defines a metric as a whole SQL aggregate expression, as Ossie does (`SUM(lineitem.net_amount) /
COUNT(DISTINCT orders.id)`), gives a `:simple` metric an aggregation of the other shape (`::aggregation.sql`): the SQL,
with a placeholder for each reference to the semantic layer's own objects, exactly as a filter is written, and the
expression as the source wrote it, for the report. The resolve stage converts it whole with the `sql-to-mbql` module's
aggregation mode (see [SQL in the IR](sql.md)): every aggregate function, filtered aggregate and arithmetic between
aggregates the module knows becomes one Lib aggregation clause, each placeholder is inlined as what its reference
names (a dimension's or named expression's column or SQL, perhaps through a join), and any other identifier is a column
of the metric's table. What the module cannot convert (a window function, a column outside an aggregate, a function it
does not know) is reported under the metric. The source decides which table the SQL is over; a reference reached
through a join is on the joined table, and the resolve stage reports a path of more than one join.

Only a `:simple` metric takes one: there is no running form of arbitrary SQL, so a `:cumulative` metric with one is
reported, and a ratio or derived metric that refers to such a metric with a filter of its own is reported too, since
only an operator aggregation can be inlined in its filtered form.

## Dimension sets

A metric's dimension set holds its table's dimensions, those of every table its joins lead to (reached by an implicit
join, the `:source-field` of the field ref), and its time dimension as the default, bucketed by its time grain when it
has one. A dimension whose `expr` is SQL, one that bounds a slowly changing dimension's validity window, and every
dimension behind a join that cannot be made are reported under the metric's `:unsupported-dimensions`. A joined
dimension named like another of the set is named `<join>__<dimension>` instead.
