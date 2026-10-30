# The IR

The IR (`schemas/ir.clj`) is the import's own model of a semantic layer, not any one tool's. It keeps the warehouse's
terms where they are the warehouse's (column names, type strings, SQL) and its own everywhere else:

| IR | What it is | dbt | Cube or OSI, roughly |
| -- | -- | -- | -- |
| table | A physical relation and what the semantic layer declares on it: documented columns, dimensions, keys, joins | a semantic model | a cube; an OSI dataset |
| relation | The table's database, schema and name, with the parts the project quoted | `node_relation`, `relation_name` | `sql_table`; a dataset's `source` |
| dimension | Something a metric can be broken out and filtered by: a column or SQL, `:categorical` or `:time`, a time one with a default grain | a dimension | a dimension; a field with `dimension` |
| key | A named key of a table, a column or SQL, which a filter can refer to | an entity | a primary key; a dataset's keys |
| join | A way from a table to another, through a column of the table, which Metabase follows as an implicit join | a foreign or unique entity, matched to the model keyed by it | a join; a relationship |
| alias | A name by which a reference can name a table itself | a model's primary entity | a cube's own name |
| metric | `:simple` (one aggregation over one table), `:cumulative` (its running total), `:ratio` or `:derived` (arithmetic over other metrics) | a metric, with its measure folded in | a measure; a metric |
| aggregation | An operator over an expression, with SQL's meaning (see below) | `agg` and `expr` | a measure's `type` and `sql` |
| time dimension | The dimension a metric is measured along over time: its default dimension | `agg_time_dimension`, `metric_time` | a time dimension |
| time grain | A granularity by name: a Metabase temporal unit's, or the source's own | a granularity | a granularity |
| filter | SQL in the warehouse's dialect, with a placeholder for each reference to a dimension, key or the time dimension | a `where_sql_template` with MetricFlow Jinja | `filters`, segments; SQL over dataset fields |

A source does the work of putting what it says in those terms. dbt's, for example, works out its joins from entity
names (`dbt/joins.clj`), rewrites its Jinja filter templates into IR filters and reports the MetricFlow syntax they
cannot hold (`dbt/filters.clj`), and folds a legacy measure into the metric that uses it (`dbt/parse.clj`).

The IR holds metrics, the one kind of content an import carries today; see [Adding a kind of
content](extending.md#adding-a-kind-of-content) for another. The SQL it holds, and the subset of it that converts, is in
[SQL in the IR](sql.md).

## Aggregations

An aggregation's operator is one of `:sum`, `:avg`, `:min`, `:max`, `:median`, `:percentile` (a continuous one, with
its fraction), `:count` (SQL's `COUNT`, which skips nulls), `:count-distinct` and `:count-where` (the rows where its
expression, a condition, holds). Its `expr` is a column, a literal or SQL; `:sum` or `:count` of `1`, or `:count` of
`*`, is a row count. The resolve stage maps them as follows:

| IR | Metabase |
| -- | -- |
| `:sum`, `:avg`, `:min`, `:max`, `:median` | `sum`, `avg`, `min`, `max`, `median` |
| `:percentile` | `percentile` with the same fraction |
| `:count` of a column or an expression | `count-where` the expression is not null |
| `:count`, `:sum` of `1`; `:count` of `*` | `count`, a row count |
| `:count-distinct` | `distinct` |
| `:count-where` of a condition, or a boolean column | `count-where` the condition, or the column being true |
| `fill-nulls-with` | the aggregation wrapped in `coalesce`; reported on a `:min` or `:max` of a non-numeric column |
| `:cumulative`, over a sum, a row count or a `:count` of a column | `cum-sum`, `cum-count`, or the `cum-sum` of a `case` that is 1 where the column is not null |
| `:ratio` | `/` of `[:metric ...]` references to the input metrics' cards |
| `:derived` | the arithmetic of its SQL over `[:metric ...]` references, by alias; `x / nullif(y, 0)` is `x / y` |
| an input with filters of its own | inlined as the filtered form of the input's aggregation, so the metric stays one card |

## Dimension sets

A metric's dimension set holds its table's dimensions, those of every table its joins lead to (reached by an implicit
join, the `:source-field` of the field ref), and its time dimension as the default, bucketed by its time grain when it
has one. A dimension whose `expr` is SQL, one that bounds a slowly changing dimension's validity window, and every
dimension behind a join that cannot be made are reported under the metric's `:unsupported-dimensions`. A joined
dimension named like another of the set is named `<join>__<dimension>` instead.
