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
types. `:base-types` overrides that for types the driver does not know, `:collection-name` renames the target
collection, and `:entity-models` (entity name → semantic model name) says which semantic model a foreign entity joins
to when more than one semantic model has that entity as its primary entity; all three are optional. A column the
project does not document, or documents without a `data_type`, is emitted
without a base type: the instance supplies it when the import binds the field, and a column that does not exist in the
warehouse fails there.

`convert!` returns a report: `:converted` lists each metric with its `entity_id` and file, and `:unsupported` lists
every metric that could not be converted with the reason ("Limitations" below collects every reason). Nothing is
silently dropped, and one bad metric does not stop the run: an unexpected exception while resolving a metric is logged
with its stack and reported like any other unsupported metric, naming the exception. Entity IDs are derived from the
dbt metric's unique ID, so re-running and re-importing updates the existing cards instead of duplicating them. A
re-run first deletes what the previous run wrote for the collection (`collections/main/<collection>.yaml` and
`collections/main/<collection>/`), so a metric renamed or removed from the project since then does not survive as a
stale file: import never deletes, so a stale card file would come back as a card. Anything else under `:out-dir` is
left alone.

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
still converts.

The tables below list the cases a real project runs into, with an example of the dbt that triggers them, why they are
not supported, and what it would take to support them: a change to the converter, to MBQL, or to Metabase metrics
themselves. Cases dbt validates against or that nobody writes (a `TimeDimension` over a categorical dimension, a
`sum` of a literal, a metric that refers to itself) are reported with a message like everything else but are not
listed. Examples are in the legacy spec unless they say otherwise; the inline spec reports the same things.

Two things are not limitations of the conversion but are checked before it: the manifest has to come from dbt 1.12 or
later (see "Supported dbt versions"), and the converter reads only `semantic_models`, `metrics` and the model `nodes`
they are defined on. Saved queries, exports and the time spine are never read.

### Metric types

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| `conversion` metrics | `type: conversion` with `base_measure: visits`, `conversion_measure: purchases`, `entity: user`, `window: 7 days` | A funnel counts, per entity, a base event followed by a conversion event within a window: a self-join with a time condition. A metric is one aggregation over one table. | A new kind of Metabase metric, a funnel over two events of an entity. MBQL has no self-join with a time window to build it on either. |
| `cumulative` with a `window` | `type: cumulative`, `type_params: {measure: revenue, window: 7 days}` (inline spec: `cumulative_type_params: {window: 7 days}`) | A trailing window is a rolling-window aggregation, which MBQL does not have. The running total minus the running total seven rows back would nest window functions, which SQL does not allow. | Extend MBQL with a windowed cumulative aggregation (`cum-sum` over a trailing span of time), compiled to a window frame. |
| `cumulative` with `grain_to_date` | `type_params: {measure: revenue, grain_to_date: month}` | A running total that resets each month needs a month breakout, and a metric cannot require one. The query processor does partition a cumulative aggregation by every breakout but the finest temporal one, so a user who breaks out by month *and* day gets month-to-date, but under a day breakout alone `cum-sum` is the all-time running total. | Extend MBQL so a cumulative aggregation can name the grain it resets at, then let a metric definition carry it. |
| `cumulative` over anything but a `sum` or a `count` | `type: cumulative` over a measure with `agg: count_distinct` (or `average`, `min`, `max`, `median`, `percentile`) | MBQL's only running aggregations are `cum-sum` and `cum-count`. SQL does not allow `DISTINCT` in a window function, and there is no running average, min, max or percentile. (A running `count` of a column, which skips nulls, converts: it is the `cum-sum` of a `case` that is 1 where the column is not null.) | Running average, min and max: extend MBQL with the window-function aggregations. A running distinct count cannot be written in SQL at all. |
| a `ratio` or `derived` input with `offset_window` | `metrics: [{name: revenue}, {name: revenue, offset_window: 1 month, alias: revenue_last_month}]` | dbt shifts the input by a fixed span of time. MBQL's `offset` is relative to the rows of the result, so its meaning changes with whatever breakout grain the user picks. | Extend MBQL with an `offset` by a span of time rather than a number of rows, then allow it in metric definitions. |
| a `ratio` or `derived` input with `offset_to_grain` | `metrics: [{name: revenue, offset_to_grain: month, alias: revenue_at_month_start}]` | The value at the start of the current period has no MBQL equivalent at all. | Extend MBQL with a "value at the start of the period" aggregation; in SQL it is a self-join or a window frame bounded at the truncated date. |
| `ratio` or `derived` inputs on different semantic models | `numerator: {name: order_count}` on `orders`, `denominator: {name: customer_count}` on `customers` | A metric queries one table, and the `[:metric ...]` references in its aggregation have to share it. | Extend Metabase metrics so a `[:metric ...]` reference may point at a card on another table, with the query processor combining the two aggregates. |
| a `filter` on an input that is not a simple metric | `numerator: {name: sales_to_target_ratio, filter: "..."}` | An input filter is inlined as the filtered form of the input's measure (`sum-where` and friends). A ratio, derived or cumulative input has no single measure to filter. | Extend Metabase metrics with a filtered `[:metric ...]` reference, so the input card is filtered instead of inlined. |
| a `filter` on an input whose aggregation has no filtered form | `numerator: {name: avg_order_value, filter: "{{ Dimension('order__status') }} = 'shipped'"}` where `avg_order_value` is an `average` | MBQL has `sum-where`, `count-where` and `distinct-where` only. There is no filtered average, min, max, median or percentile. | Extend MBQL with the missing filtered aggregations (`avg-where`, ...) or one general filtered-aggregation clause; or the filtered metric reference above. |
| a `filter` that references a metric | `filter: "{{ Metric('order_total', group_by=['customer']) }} > 1000"` | A condition on a metric's value is a `HAVING` over a grouped subquery. A metric's aggregation has no place for it. | Extend Metabase metrics with a condition on another metric grouped by an entity, which the query processor would compile to a filtered subquery joined back in. |

### Measures and aggregations

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| `non_additive_dimension` | `non_additive_dimension: {name: metric_time, window_choice: max, window_groupings: [account]}` | A semi-additive measure takes one time slice per group before it aggregates (each account's balance at its latest date). Nothing in MBQL picks a row per group ahead of the aggregation. | Extend MBQL with a "latest row per group" pre-aggregation step (a window-function filter), then let a metric carry it. |
| discrete percentiles | `agg: percentile`, `agg_params: {percentile: 0.5, use_discrete_percentile: true}` | Metabase percentiles are continuous: they interpolate between rows. `percentile_type: continuous` (inline spec `use_approximate_percentile`) converts. | Extend MBQL with a discrete percentile aggregation (`percentile_disc`), with driver support where the warehouse has it. |

### SQL in `expr` and `filter`

A measure's `expr` and a `filter` are parsed with sqlglot and mapped onto MBQL clause by clause. The subset that maps is
listed under "Filters and SQL expressions"; everything outside it is reported, naming the construct:

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| a function with no MBQL expression function of the same meaning | `greatest(a, b)`, `regexp_replace(x, 'a', 'b')`, `to_char(d, 'YYYY')`, `ln(x)`, `log(2, x)`, `dateadd(day, 1, d)`, `extract(dow from d)`, `trim('x' from s)`, `round(x, -1)`, `date_trunc('decade', d)`, `date_trunc('month', d + 1)` | The functions that have an MBQL expression function with the same meaning are mapped (the list is under "Filters and SQL expressions"); the rest have nothing to map onto. `round` to a number of decimals is `round(x * 10^n) / 10^n`, so the decimals have to be a literal. `date_trunc` is a temporal bucket on a column ref, so there is nothing to bucket when its argument is an expression, and nothing for a unit Metabase does not have. | Extend the converter where MBQL has an equivalent under another shape (`dateadd` as `datetime-add`, `greatest` as a `case`); extend MBQL with the rest (a regex replace, a date format, a natural log, week and day-of-week extraction that agrees on the first day of the week). |
| a `CAST` to anything but an integer, decimal, float, text, date or timestamp type | `cast(x as boolean)`, `x::uuid`, `cast(x as interval)` | MBQL's conversions are `integer`, `float`, `text`, `date` and `datetime`, and the common SQL spellings of those types map onto them (`cast(amount_cents as decimal) / 100` converts). | Extend MBQL with the missing conversions. |
| a `LIKE`, `SIMILAR TO` or regex pattern that is not a string literal | `like {{ Dimension('order__prefix') }} \|\| '%'`, `~ {{ Dimension('order__pattern') }}` | A pattern that is a column or an expression cannot be taken apart into Lib's string filters, and the regex fallback needs the regex as a literal too. | Extend MBQL with a `like` clause taking an expression as the pattern. |
| a custom calendar granularity | `TimeDimension('order__ordered_at', 'retail_month')`, defined on the project's time spine | Metabase buckets by its standard truncation units, `minute` through `year`. `fiscal_quarter` is read as `quarter` until custom calendars are supported. | Custom calendars in Metabase, then a mapping from a dbt custom granularity onto one. |
| a dimension reached through two entities | `Dimension('order__customer__region')` | A dimension mapping is one implicit join, a foreign key on the metric's table to the joined table's key. A two-hop path has no representation. | Extend Metabase metrics so a dimension mapping can carry a multi-hop join path, or so a metric query can hold explicit joins. |

### Dimensions and joins

These apply to the curated dimension set and are reported under `:unsupported-dimensions`; the metric converts without
them. The same conditions inside a `filter` make the metric itself unsupported, since the filter cannot be written.

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| a dimension whose `expr` is SQL | `dimensions: [{name: is_large_order, type: categorical, expr: "amount > 100"}]`, or any `derived_semantics` dimension | A dimension mapping targets a column of the table or of a joined table. There is no place in it for an expression. | Extend Metabase metrics so a dimension mapping can target an expression, or let a table carry computed columns the mapping can point at. |
| a foreign entity whose `expr` is SQL, on either side of the join | `entities: [{name: customer, type: foreign, expr: "cast(customer_key as varchar)"}]` | An implicit join is a foreign-key column pointing at a primary-key column (`:source-field`). | Extend Metabase metrics so the join behind a dimension mapping can be an explicit join on an expression. |

### Manifest and configuration errors

These are reported the same way, but they are fixed in the project or the config rather than being limits of the
conversion:

- A warehouse database with no entry in the config's `:databases`.
- A column whose `data_type` the config's `:driver` does not know; add it to `:base-types`.
- A metric whose semantic model, measure or input metric is not in the manifest, for example because it is disabled.
- A foreign entity that more than one semantic model is primary for (`customer` declared `type: primary` on both
  `dim_customer` and `dim_customer_history`) with no entry in the config's `:entity-models` naming the model it joins
  to, or an entry naming a model that is not primary for it. An entity no model is primary for is just a key and
  reports nothing.

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
`dev.dbt-import.sql`), which parses an expression on its own in the dialect of the config's `:driver`, and a subset
of SQL maps onto MBQL:

- column references, literals, `+ - * /` and `^`, comparisons, `AND`/`OR`/`NOT`, `IN`, `BETWEEN`;
- `IS [NOT] NULL`, `IS [NOT] TRUE` and `IS [NOT] FALSE`, the negated boolean forms as `!= ... OR IS NULL` so that
  they still hold for a null column;
- `IS [NOT] DISTINCT FROM`, the null-safe comparison. Against a literal it is `=` or `!=`: `=` is null, so false in a
  filter, for a null column, and Metabase compiles `!=` on a column to include the nulls (on an expression it does
  not, so `OR IS NULL` is added). Between two columns it is spelled out over `IS NULL` checks with every branch
  two-valued: `a IS NOT DISTINCT FROM b` is `(a IS NOT NULL AND b IS NOT NULL AND a = b) OR (a IS NULL AND b IS NULL)`
  and `a IS DISTINCT FROM b` is `(a IS NOT NULL AND b IS NOT NULL AND a != b) OR (a IS NULL AND b IS NOT NULL) OR
  (a IS NOT NULL AND b IS NULL)`. The longer form was chosen over `COALESCE(..., FALSE)` because it runs on warehouses
  with no boolean values (SQL Server, Oracle) too;
- `LIKE` and `ILIKE` with any literal pattern, with or without `ESCAPE`. A `%x%`, `x%`, `%x` or `x%y` pattern, or
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
- both forms of `CASE`, the simple `CASE x WHEN v` as `CASE WHEN x = v`;
- `CAST` (and `::`) to an integer, decimal, float, text, date or timestamp type, as `integer`, `float`, `text`,
  `date` and `datetime`;
- the functions with an MBQL expression function of the same meaning: `coalesce`, `nullif` (as the `CASE` it stands
  for; `x / NULLIF(y, 0)` is plain division, since Metabase's `/` already returns NULL for a zero divisor), `abs`,
  `floor`, `ceil`/`ceiling`, `round` (to a literal number of decimals, as `round(x * 10^n) / 10^n`), `sqrt`, `exp`,
  `log` (base 10, as in Metabase; `ln` does not map), `power`, `lower`, `upper`, `trim`/`ltrim`/`rtrim` (of spaces),
  `length`/`char_length`, `replace`, `substring`/`substr`, `concat` and `||`, `extract`/`date_part` of `year`,
  `quarter`, `month`, `day`, `hour`, `minute` or `second`, `now()`/`current_timestamp`, `current_date`, and
  `date_trunc` over a column to a Metabase temporal unit (`minute` through `year`), which is the column bucketed by
  that unit.

Anything outside that subset is reported, naming the construct; see "Limitations".

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
| `cumulative` with no window over a `sum`, a row count or a `count` of a column | `cum-sum` / `cum-count`, or for a `count` of a column (which skips nulls) `cum-sum` of a `case` that is 1 where the column is not null; the metric's filters apply as on a simple metric |
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
