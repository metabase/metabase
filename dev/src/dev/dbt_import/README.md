# Ingestion Steps

## Clone Flexanalytics Repo

```sh
git clone https://github.com/flexanalytics/dbt-business-intelligence
```

## Create dbt config (so it uses the correct SQL dialect plugin for macros):

This is only needed to run `dbt` by hand; the fixture generator below writes its own. Save this in
`~/.dbt/profiles.yml`:

```yaml
dbt_business_intelligence:
  target: dev
  outputs:
    dev:
      type: postgres
      host: localhost
      port: 5432
      user: nobody
      password: nothing
      dbname: dbt_bi
      schema: public
```

Note that it doesn't actually connect to Postgres so the `user`, `password`, etc. can be nonsense.

## Generate `target/manifest.json`:

If you have `uv` installed:

```sh
uvx --from dbt-core --with dbt-postgres dbt deps
uvx --from dbt-core --with dbt-postgres dbt parse
```

If you don't have `uv` installed but have `dbt` itself installed you should instead be able to do:

```sh
dbt deps
dbt parse
```

I haven't tested this.

`target/manifest.json` should now exist.

## Supported dbt versions

The converter reads manifests written by **dbt 1.12 or later**, on manifest schema v12. It checks `metadata` first
and rejects anything else up front with `Unsupported dbt manifest`, naming the `dbt_version` and `dbt_schema_version`
it found. Older releases are not supported, even though dbt 1.8 to 1.11 also write schema v12: they lack the
`type_params` keys that arrived with the 1.12 inline spec (`fill_nulls_with`, `cumulative_type_params`,
`metric_aggregation_params`), which the manifest schemas in `dev.dbt-import.schemas.dbt-manifest` require. To import
an older project, upgrade dbt and run `dbt parse` again; a project on the legacy spec (top-level `semantic_models:`
and `metrics:`) needs no changes for that, dbt 1.12 still parses it.

## Convert the manifest to Metabase metrics

From a dev REPL (needs the `:ee` alias on the classpath for the serdes YAML writer):

```clojure
(require '[dev.dbt-import.core :as dbt-import])

(dbt-import/convert! {:manifest "/path/to/dbt-business-intelligence/target/manifest.json"
                      :out-dir  "/path/to/serdes-out"
                      :config   {:databases     {"dbt_bi" "Sales DB"}   ; warehouse db name -> Metabase Database name
                                 :driver        :postgres               ; the Metabase driver for those databases
                                 :creator-email "admin@example.com"}})  ; the user the cards are created as
```

The config's `:databases` is the only mapping the manifest cannot supply: the key is the warehouse database as dbt
knows it (`node_relation.database` in the manifest), the value is the name of the Metabase Database it is connected
as. `:driver` picks whose `database-type->base-type` turns the project's declared column types into Metabase base
types. `:base-types` overrides that for types the driver does not know and `:collection-name` renames the target
collection; both are optional. A column the project does not document, or documents without a `data_type`, is emitted
without a base type: the instance supplies it when the import binds the field, and a column that does not exist in the
warehouse fails there.

`convert!` returns a report: `:converted` lists each metric with its `entity_id` and file, and `:unsupported` lists
every metric that could not be converted with the reason ("Limitations" below collects every reason). Nothing is
silently dropped, and one bad metric does not stop the run: an unexpected exception while resolving a metric is logged
with its stack and reported like any other unsupported metric, naming the exception. Entity IDs are derived from the
dbt metric's unique ID, so re-running and re-importing updates the existing cards instead of duplicating them.

The output is a serdes tree, `collections/main/<collection>.yaml` plus one card per metric under
`collections/main/<collection>/`, in the same format `export` produces. Import it into the instance from QRES-2:

```sh
MB_DB_CONNECTION_URI=... clojure -M:run:ee import /path/to/serdes-out -e
```

Then open each metric in the UI, run it, and compare the number against a hand-written SQL query. The end-to-end
test below does the same thing against a test instance.

## Limitations

A Metabase metric is one aggregation over one table, optionally filtered, with a curated set of dimensions it can be
broken out by. Whatever dbt can say that does not fit that shape is not approximated: the converter reports each case
and moves on. A metric it cannot convert is listed in the report's `:unsupported` with the reason, and a dbt dimension
that cannot become a curated dimension is listed under the metric's `:unsupported-dimensions` while the metric itself
still converts. The tables below collect every such case with an example of the dbt that triggers it. Examples are in
the legacy spec unless they say otherwise; the inline spec reports the same things.

Two things are not limitations of the conversion but are checked before it: the manifest has to come from dbt 1.12 or
later (see "Supported dbt versions"), and the converter reads only `semantic_models`, `metrics` and the model `nodes`
they are defined on. Saved queries, exports and the time spine are never read.

### Metric types

| dbt | Example | Why it is unsupported |
| -- | -- | -- |
| `conversion` metrics | `type: conversion` with `base_measure: visits`, `conversion_measure: purchases`, `entity: user`, `window: 7 days` | A funnel counts, per entity, a base event followed by a conversion event within a window: a self-join with a time condition. A metric is one aggregation over one table. |
| `cumulative` with a `window` | `type: cumulative`, `type_params: {measure: revenue, window: 7 days}` (inline spec: `cumulative_type_params: {window: 7 days}`) | A trailing window is a rolling-window aggregation, which MBQL does not have. The running total minus the running total seven rows back would nest window functions, which SQL does not allow. |
| `cumulative` with `grain_to_date` | `type_params: {measure: revenue, grain_to_date: month}` | A running total that resets each month needs a month breakout, and a metric cannot require one. The query processor does partition a cumulative aggregation by every breakout but the finest temporal one, so a user who breaks out by month *and* day gets month-to-date, but under a day breakout alone `cum-sum` is the all-time running total. |
| `cumulative` over anything but a `sum` or a row count | `type: cumulative` over a measure with `agg: count_distinct` (or `average`, `min`, `max`, `median`, `percentile`), or `agg: count` with `expr: order_id` | MBQL's only running aggregations are `cum-sum` and `cum-count`. SQL does not allow `DISTINCT` in a window function, and there is no running average, min, max or percentile. `cum-count` counts rows, nulls included, so a running `count` of a column, which skips nulls, is not it either. |
| `cumulative` over a metric that is not simple (inline spec) | `cumulative_type_params: {metric: sales_to_target_ratio}` | A cumulative metric runs the aggregation of the metric it is built on, and a ratio or derived metric has no single aggregation to run. |
| a `ratio` or `derived` input with `offset_window` | `metrics: [{name: revenue}, {name: revenue, offset_window: 1 month, alias: revenue_last_month}]` | dbt shifts the input by a fixed span of time. MBQL's `offset` is relative to the rows of the result, so its meaning changes with whatever breakout grain the user picks. |
| a `ratio` or `derived` input with `offset_to_grain` | `metrics: [{name: revenue, offset_to_grain: month, alias: revenue_at_month_start}]` | The value at the start of the current period has no MBQL equivalent at all. |
| a `derived` `expr` that is not arithmetic over its inputs | `expr: "100"`, or `expr: "revenue * tax_rate"` where `tax_rate` is not one of `metrics` | Metric definitions (`metabase.lib-metric`) allow arithmetic over `[:metric ...]` and `[:measure ...]` leaves only. A constant or a name that is not an input is neither. |
| `ratio` or `derived` inputs on different semantic models | `numerator: {name: order_count}` on `orders`, `denominator: {name: customer_count}` on `customers` | A metric queries one table, and the `[:metric ...]` references in its aggregation have to share it. |
| a `filter` on an input that is not a simple metric | `numerator: {name: sales_to_target_ratio, filter: "..."}` | An input filter is inlined as the filtered form of the input's measure (`sum-where` and friends). A ratio, derived or cumulative input has no single measure to filter. |
| a `filter` on an input whose aggregation has no filtered form | `numerator: {name: avg_order_value, filter: "{{ Dimension('order__status') }} = 'shipped'"}` where `avg_order_value` is an `average` | MBQL has `sum-where`, `count-where` and `distinct-where` only. There is no filtered average, min, max, median or percentile. |
| a `filter` that references a metric | `filter: "{{ Metric('order_total', group_by=['customer']) }} > 1000"` | A condition on a metric's value is a `HAVING` over a grouped subquery. A metric's aggregation has no place for it. |
| a metric that refers to itself, directly or through its inputs | `a` derived from `b` and `b` derived from `a` | There is no order to write them in. |

### Measures and aggregations

| dbt | Example | Why it is unsupported |
| -- | -- | -- |
| `non_additive_dimension` | `non_additive_dimension: {name: metric_time, window_choice: max, window_groupings: [account]}` | A semi-additive measure takes one time slice per group before it aggregates (each account's balance at its latest date). Nothing in MBQL picks a row per group ahead of the aggregation. |
| discrete percentiles | `agg: percentile`, `agg_params: {percentile: 0.5, use_discrete_percentile: true}` | Metabase percentiles are continuous: they interpolate between rows. `percentile_type: continuous` (inline spec `use_approximate_percentile`) converts. |
| a percentile without a value, or out of range | `agg: percentile` with no `agg_params`, or `agg_params: {percentile: 1.5}` | dbt documents the percentile as a fraction between 0 and 1; a percentage up to 100 is tolerated. |
| `sum_boolean` over a column that is not boolean | `agg: sum_boolean, expr: status` where `status` has `data_type: text` | Metabase has no boolean sum. The converter writes it as a `count-where` the column is true, which needs a boolean column; a column with no documented type is trusted. |
| a measure over a literal or `*` that is not a row count | `agg: sum, expr: "2"`, `agg: average, expr: "*"` | Metabase aggregations take a column or an expression. `count(*)`, `count(1)` and `sum(1)` are row counts and do convert. |
| `fill_nulls_with` on a `min` or `max` of a non-numeric column | `agg: max, expr: status, fill_nulls_with: 0` | The fill is written as `coalesce` around the aggregation, and `COALESCE(MAX(text), 0)` fails in the warehouse. Every other aggregation returns a number, so the fill is fine there. |

### SQL in `expr` and `filter`

A measure's `expr` and a `filter` are parsed with sqlglot and mapped onto MBQL clause by clause. The subset that maps is
listed under "Filters and SQL expressions"; everything outside it is reported, naming the construct:

| dbt | Example | Why it is unsupported |
| -- | -- | -- |
| any function (`NULLIF(x, 0)` as a divisor excepted) | `expr: "coalesce(discount, 0) * price"`, `filter: "lower({{ Dimension('order__status') }}) = 'shipped'"` | There is no general mapping from a warehouse's functions to MBQL expressions, and each dialect has its own. `x / NULLIF(y, 0)` is the one exception, only because Metabase's `/` already returns NULL for a zero divisor. |
| `CAST` | `expr: "cast(amount_cents as decimal) / 100"` | Casts are not in the subset; the column's declared `data_type` decides its Metabase type. |
| a simple `CASE` | `expr: "case status when 'shipped' then 1 else 0 end"` | Only the searched form, `CASE WHEN condition THEN ... END`, maps onto MBQL `case`. |
| `IN` over a subquery | `filter: "{{ Entity('customer') }} in (select id from vip_customers)"` | MBQL `in` takes a list of values. |
| `IS` anything but `NULL` | `filter: "{{ Dimension('order__is_paid') }} is true"` | Only `IS [NOT] NULL` maps, to `is-null` / `not-null`. Write `= true` instead. |
| a `LIKE` pattern other than `%x%`, `x%` or `%x`, or one that is not a string literal | `like 'a%b'`, `like 'order_'`, `like other_column`, `ilike 'x'` with no wildcard | Those three patterns are `contains`, `starts-with` and `ends-with`. MBQL has no general pattern match. |
| Jinja that is not a MetricFlow reference | `filter: "{% if var('strict') %} ... {% endif %}"` | The converter renders `Dimension(...)`, `TimeDimension(...)`, `Entity(...)` and `Metric(...)`; anything else is left in the SQL, which then does not parse. |
| a `filter` with no reference at all | `filter: "1 = 1"` | dbt filters address columns through the semantic graph. A condition that references nothing is rejected rather than bound to the metric's table by guesswork. |
| `TimeDimension(...)` on a dimension that is not a time dimension, or whose `expr` is SQL | `TimeDimension('order__status', 'month')`, or a `derived_semantics` time dimension with `expr: "date_trunc('day', created_at)"` | Temporal bucketing applies to a time column. |
| a granularity Metabase has no unit for | `TimeDimension('order__ordered_at', 'nanosecond')`, or a custom calendar granularity such as `retail_month` | Metabase buckets by its standard truncation units, `minute` through `year`. `fiscal_quarter` is read as `quarter` until custom calendars are supported. |
| `metric_time` on a measure with no `agg_time_dimension` | `filter: "{{ TimeDimension('metric_time', 'month') }} >= '2024-01-01'"` on a model with no `defaults: {agg_time_dimension: ...}` and none on the measure | `metric_time` stands for the measure's aggregation time dimension; without one it stands for nothing. |
| a dimension reached through two entities | `Dimension('order__customer__region')` | A dimension mapping is one implicit join, a foreign key on the metric's table to the joined table's key. A two-hop path has no representation. |

### Dimensions and joins

These apply to the curated dimension set and are reported under `:unsupported-dimensions`; the metric converts without
them. The same conditions inside a `filter` make the metric itself unsupported, since the filter cannot be written.

| dbt | Example | Why it is unsupported |
| -- | -- | -- |
| a dimension whose `expr` is SQL | `dimensions: [{name: is_large_order, type: categorical, expr: "amount > 100"}]`, or any `derived_semantics` dimension | A dimension mapping targets a column of the table or of a joined table. There is no place in it for an expression. |
| a foreign entity whose `expr` is SQL, on either side of the join | `entities: [{name: customer, type: foreign, expr: "lower(customer_key)"}]` | An implicit join is a foreign-key column pointing at a primary-key column (`:source-field`). |
| a foreign entity that more than one semantic model is primary for | `customer` declared `type: primary` on both `dim_customer` and `dim_customer_history` | The join target has to be unambiguous. An entity no model is primary for is just a key and reports nothing. |
| a join to a semantic model in another Metabase database | `orders` is in a warehouse database mapped to `Sales DB` and `customers` in one mapped to `CRM DB` under `:databases` | Metabase does not join across databases. |
| a joined model whose `primary_entity` names an entity it does not declare | `primary_entity: customer` with no `customer` under `entities` | There is no column on that side to join on. |
| an `agg_time_dimension` that is not a dimension of the model | `defaults: {agg_time_dimension: created_at}` with no `created_at` dimension | The metric's default dimension has to be one of its dimensions. |

### Manifest and configuration errors

These are reported the same way, but they are fixed in the project or the config rather than being limits of the
conversion:

- A warehouse database with no entry in the config's `:databases`.
- A column whose `data_type` the config's `:driver` does not know; add it to `:base-types`.
- A metric whose semantic model, measure or input metric is not in the manifest, for example because it is disabled.
- A `ratio` without both a `numerator` and a `denominator`, a `derived` metric without an `expr` or without input
  metrics, or a simple metric with neither a measure nor `metric_aggregation_params`.

## The end-to-end test

`dev/test/dev/dbt_import/e2e_test.clj` is the import of QRES-2 as a test: it loads the project's mart tables into a
Postgres test dataset, converts the fixture manifest for that database, imports the YAML with serdes, and checks that
every converted metric returns the number a hand-written SQL query does, that the curated dimensions break a metric
out through their implicit joins, that the cards came through with result metadata, and that importing a second time
updates the cards instead of duplicating them. It runs on Postgres only: the manifest names its tables
`public.fact_sales` and so on, serdes binds a field ref by exact name, and a Postgres test dataset is called exactly
that, where H2 would upper-case it. Like the other tests in `dev/test`, it is not picked up by the default test run,
so run it by name with the Postgres driver enabled:

```sh
./bin/test-agent --drivers=postgres :only '[dev.dbt-import.e2e-test]'
```

The dataset is `dev/resources/dbt_import/flexanalytics_marts.edn`, the four mart tables the semantic models are defined
on (`fact_sales`, `dim_customer`, `dim_product`, `dim_order`; `dim_date` has no semantic model), in the format of
`test/metabase/test/data/dataset_definitions/*.edn`, with dbt's surrogate keys as primary and foreign keys so a sync
knows the joins. Regenerate it after the checkout changes, from a REPL at the repo root with a Postgres to build the
project in (the connection defaults to the test suite's `MB_POSTGRESQL_TEST_*` settings; the database `dbt_bi` has
to exist):

```clojure
(dev.dbt-import.marts/regenerate!)
(dev.dbt-import.marts/regenerate! {:connection {:port 15432, :user "postgres", :password "password"}})
```

It copies the clone to a scratch directory like `dev.dbt-import.fixture/regenerate!` does, runs `dbt seed` and
`dbt run` there against that Postgres, and dumps the tables.

## The test fixtures

Two manifests under `dev/resources/dbt_import/`, one per way of writing a dbt semantic layer, both trimmed to the
sections the converter reads and both written by `dbt parse` under dbt 1.12.6 (manifest schema v12). That is the only
kind of manifest the converter accepts, see "Supported dbt versions".

`flexanalytics_manifest.json` is the flexanalytics project's manifest, on the **legacy spec** (top-level
`semantic_models:` with `measures:`, and `metrics:` pointing at a measure), plus the metrics in
`flexanalytics_extra_metrics.yml`: the project only defines simple metrics, so that file adds one of each type that
composes other metrics (ratio, derived, cumulative) and a conversion metric, in the shape dbt itself writes.
`sales_to_target_ratio_2` is the correct ratio form of the project's `sales_to_target`, which averages a per-row
`sales / target`; both are kept. To run the extra metrics in a dev instance (QRES-2), paste them into the clone's
`semantic_models.yml` under `metrics:` and `dbt parse` it the same way.

`parcel_delivery_manifest.json` is the manifest of the small project checked in under `parcel_delivery/`, on the
**dbt 1.12 inline spec**, see the next section. It is the shape of four redacted models from a customer's project,
renamed onto a parcel-delivery domain with the BigQuery types turned into Postgres ones: four semantic models, nineteen
metrics covering every aggregation the inline spec allows except `sum_boolean`, `median` and `min`/`max`, a ratio, a
derived metric, two cumulative ones, filters, a SQL `expr`, and `derived_semantics` SQL dimensions.
`dev/test/dev/dbt_import/inline_spec_test.clj` pins down what the parser makes of it and what the pipeline converts.

Regenerate a fixture after changing its project (or the clone, or the extra metrics), from a REPL at the repo root:

```clojure
(dev.dbt-import.fixture/regenerate! :parcel-delivery)
(dev.dbt-import.fixture/regenerate! :flexanalytics)                                                   ; ~/dbt-business-intelligence
(dev.dbt-import.fixture/regenerate! :flexanalytics {:project "/path/to/dbt-business-intelligence"})
```

It copies the project to a scratch directory, writes a `profiles.yml` there (`dbt parse` needs a profile for the
adapter and the warehouse database name, which the manifest records, but never connects), splices the extra metrics
in for flexanalytics, runs `dbt parse` (through `uvx` unless `dbt` is on PATH) and writes the trimmed result in the
format dbt writes, so a regeneration's diff is only what changed, plus dbt's `created_at` and `generated_at`
timestamps. The project is not modified.

## The dbt 1.12 inline spec

dbt 1.12 lets a project declare its semantic layer on the models themselves instead of in separate top-level blocks:
`semantic_model:` nested under the entry in `models:`, `entity:` and `dimension:` on the entries under `columns:`,
`agg_time_dimension` on the model, further SQL dimensions under `derived_semantics:`, and `metrics:` on the model
with their own `agg` and `expr` and no `measures:` list anywhere. Composed metrics use new keywords too: a ratio's
`numerator` and `denominator` stand alone, a derived metric lists `input_metrics`, and a cumulative one names its
`input_metric` and a `period_agg`. (dbt also insists on a time spine model before it will parse any metric;
`parcel_delivery/models/time_spine.sql` is the smallest one that satisfies it, and the converter never reads it.)

The bet behind reading `manifest.json` rather than the YAML was that dbt normalizes both specs into the same
`semantic_models` plus `metrics` structure. It does, with three differences the parser handles (QRES-6):

- A semantic model's `measures` is empty. Every aggregation is on a metric.
- A simple metric carries `type_params.metric_aggregation_params` (`semantic_model`, `agg`, `agg_params`,
  `agg_time_dimension` already defaulted from the model, `non_additive_dimension`) with the expression next to it in
  `type_params.expr`, nil when the column is the metric's name. `agg_params` is written for every aggregation, and
  `percentile_type: continuous` comes out as `use_approximate_percentile: true`, not as a discrete percentile.
- A cumulative metric depends on the simple metric it runs over (`cumulative_type_params.metric` and `depends_on`),
  not on a semantic model. The parser takes that metric's aggregation, semantic model and filters; a window or
  `grain_to_date` is reported as on the legacy spec.

Entities and dimensions come out exactly as on the legacy spec, including a primary entity declared without a name,
which dbt names after its column, and the `derived_semantics` dimensions, which arrive with their SQL as `expr`.
Everything after the parser is none the wiser: the inline-spec fixture converts to the same clauses the legacy one
does.

## Filters and SQL expressions

A measure's `expr` may be SQL rather than a column, and a metric or measure may carry a `filter` of Jinja-wrapped
MetricFlow references around SQL. Both go through sqlglot (`metabase.sql-parsing.core/parse-expression`, used by
`dev.dbt-import.sql`), which parses an expression on its own in the dialect of the config's `:driver`, and a small
subset of SQL maps onto MBQL: column references, literals, `+ - * /`, comparisons, `AND`/`OR`/`NOT`,
`IN`, `BETWEEN`, `IS [NOT] NULL`, `LIKE` with a `%x%`, `x%` or `%x` pattern, and `CASE WHEN ... THEN ... ELSE ... END`.
`x / NULLIF(y, 0)` is plain division, since Metabase's `/` already returns NULL for a zero divisor. Anything outside
that subset is reported, naming the construct; see "Limitations".

In a filter, `Dimension('<entity>__<dimension>')` resolves to one of the metric's own columns when the entity is the
semantic model's primary entity, and `TimeDimension(..., '<grain>')` additionally buckets it by the matching Metabase
temporal unit; `metric_time` is the measure's `agg_time_dimension` and `Entity('<name>')` is that entity's column. A
dimension reached through a foreign entity is on the semantic model that entity is primary for, and resolves to that
model's column joined implicitly through the entity's column (see "Entities and dimensions"). `Metric(...)` references
are reported (see "Limitations").

## Advanced metric types

Metrics that compose other metrics (QRES-5) are always top-level `metrics:` entries. They convert as follows; the
metrics they refer to are written before them.

| dbt | Metabase |
| -- | -- |
| `ratio` of `numerator` to `denominator` | one metric card whose aggregation divides `[:metric ...]` references to the input metrics' cards |
| `derived` with `expr` over `metrics` | the same arithmetic over `[:metric ...]` references, aliases resolved; `x / nullif(y, 0)` is `x / y` |
| an input (`numerator`, `denominator`, `metrics[]`) with its own `filter` | inlined as `sum-where`, `count-where` or `distinct-where` over the input's measure, with the input's own filters and the reference's combined, so the metric stays one card |
| `cumulative` with no window over a `sum` or a row count | `cum-sum` / `cum-count`; the metric's filters apply as on a simple metric |
| `conversion` | out of scope, reported |

Every other form is reported with the reason: a cumulative `window` or `grain_to_date`, an input with an
`offset_window` or `offset_to_grain`, a `conversion` metric, a `filter` on an input whose aggregation has no filtered
form. "Limitations" lists them all with the reasoning.

## Entities and dimensions

Each metric card is written with a curated dimension set (`dimensions` and `dimension_mappings`), so it can be broken
out in the UI as soon as it is imported:

- Every dimension of the metric's own semantic model whose `expr` is a column becomes a dimension of the metric's
  table. A time dimension's `time_granularity` is its default temporal unit.
- Every foreign entity of the model joins to the semantic model that has an entity of the same name as its primary
  entity. That model's dimensions become dimensions of the metric too, reached by an implicit join: the mapping's
  target names the joined column with `:source-field` set to the entity's column on the metric's table, the same way
  Metabase represents a column reached through a foreign key. The instance has to know that foreign key, through sync
  or a Field edit, for the breakout to run. No explicit join clause is written to the query.
- The measure's `agg_time_dimension` (the model default or the measure's own) is the metric's default dimension.

Dimension ids are derived from the metric's dbt unique ID and the dimension's reference, so a re-run writes the same
ids and a re-import updates the dimensions in place. Groups are named after the semantic model's label, or its table.

A dbt dimension that cannot be a curated dimension, because its `expr` is SQL or because the join behind its foreign
entity cannot be made, is listed per metric under `:unsupported-dimensions` in the report rather than dropped;
"Limitations" lists the cases.

Pipeline: `parse` (manifest -> IR) -> `resolve` (IR + config -> Lib queries against a metadata provider built from the
manifest, entity ids) -> `emit` (serdes YAML, with serdes' own MBQL export turning the provider's ids back into
names). MBQL is never written or read by hand: queries are built with `metabase.lib.core` and what the converter needs
to know about them comes from Lib. Each stage only knows the previous stage's schema, see `dev.dbt-import.schemas.*`.
