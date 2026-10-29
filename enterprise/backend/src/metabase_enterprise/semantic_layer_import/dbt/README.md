# The dbt source

Imports the metrics of a dbt project's semantic layer into Metabase. It reads the `manifest.json` a dbt project writes
and parses it into the import's intermediate representation (IR); the shared part of the import turns that into Metabase
metric cards, as a serdes export tree that `import` loads. See [the module's README](../README.md) for how the import
fits together, and the documents it links to for [the IR](../ir.md), [the config](../config.md), [the
report](../report.md), [importing the result](../importing.md) and [the SQL that converts](../sql.md). This one covers
what is dbt's: producing a manifest, running an import of one, and how each dbt construct converts or why it does not.

The dbt source is a nested module, `enterprise/semantic-layer-import.dbt`:

- `dbt.manifest` holds the schemas the manifest is decoded against: the record of which manifest keys the import
  reads;
- `dbt.parse` turns the decoded manifest into the IR: a semantic model becomes an IR table, a metric an IR metric with
  its measure folded in, and dbt's own defaulting rules are applied. What is structurally beyond Metabase (a cumulative
  window, a conversion metric) is reported here;
- `dbt.joins` works out the IR's joins and aliases from the entities, the way MetricFlow joins semantic models;
- `dbt.filters` rewrites a `filter`'s Jinja templates into IR filters, and reports the MetricFlow syntax they cannot
  hold;
- `dbt.adapter` maps the dbt adapter the manifest was written with to a Metabase driver;
- `dbt.core` implements `interface/raw->ir` for `:dbt`: the module's `core/convert!` loads it and calls it to parse a
  manifest.

## Importing a dbt project

### Producing `target/manifest.json`

The import was developed against https://github.com/flexanalytics/dbt-business-intelligence, a dbt project on the
legacy semantic-layer spec. Clone it, then run dbt's `deps` and `parse` commands in the checkout. With `uv` installed
no dbt installation is needed:

```sh
git clone https://github.com/flexanalytics/dbt-business-intelligence
cd dbt-business-intelligence
uvx --from dbt-core --with dbt-postgres dbt deps
uvx --from dbt-core --with dbt-postgres dbt parse
```

With a `dbt` of your own on `PATH`, `dbt deps` and `dbt parse` do the same. Either way `target/manifest.json` now
exists.

`dbt parse` needs a profile for the project, so that macros resolve against the right adapter and the manifest records
a warehouse database name, but it never connects. Save this as `~/.dbt/profiles.yml`; everything but `type` and
`dbname` can be nonsense:

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

(The fixture generator described under "Fixtures and tests" writes a profile of its own and needs none of this.)

### Supported dbt versions

The import reads manifests written by **dbt 1.12 or later**, on manifest schema v12. It checks `metadata` first and
rejects anything else up front with `Unsupported dbt manifest`, naming the `dbt_version` and `dbt_schema_version` it
found. dbt 1.12 is the release the import is written and tested against: the one that introduced the inline
(`models:`-nested) spec, with `metric_aggregation_params` and `cumulative_type_params.metric`, and the one both fixtures
were generated with. Older releases are not supported: dbt 1.8 to 1.11 also write schema v12, and much of what the
manifest schemas in `metabase-enterprise.semantic-layer-import.dbt.manifest` read predates 1.12 (`fill_nulls_with` is
from dbt 1.7, `cumulative_type_params` from 1.9), but nothing has checked what those releases write, so they are refused
rather than guessed at. To import an older project, upgrade dbt and run `dbt parse` again; a project on the legacy spec
(top-level `semantic_models:` and `metrics:`) needs no changes for that, dbt 1.12 still parses it.

The schemas require only the keys the import cannot do without. A key dbt-core writes as `null` when unset may be
left out altogether, as another writer of the manifest (dbt Fusion, a hand-written file) might leave it; the import
reads a missing key as `null`.

### Running an import

From a dev REPL (needs the `:ee` alias on the classpath for the serdes YAML writer):

```clojure
(require '[metabase-enterprise.semantic-layer-import.core :as semantic-layer-import])

(semantic-layer-import/convert!
 {:type    :dbt
  :raw     "/path/to/dbt-business-intelligence/target/manifest.json"
  :out-dir "/path/to/serdes-out"
  :config  {:databases     {"dbt_bi" "Sales DB"}   ; warehouse db name -> Metabase Database name
            :driver        :postgres               ; the Metabase driver for those databases
            :creator-email "admin@example.com"}})  ; the user the cards are created as
```

A relative `:out-dir` (or `:raw`) resolves against the JVM's working directory (`user.dir`): the repo root for a REPL
started there. `convert!` returns [the import's report](../report.md), and the tree it writes is checked with
`metabase-enterprise.semantic-layer-import.core/preflight` before importing it (see [Importing the
result](../importing.md)).

The `:config` is [the import's](../config.md). For dbt:

- `:databases` maps the warehouse database as dbt knows it, `node_relation.database` in the manifest, to the Metabase
  Database's name. The key is `nil` for an adapter that writes `database: null` (dbt-mysql, whose MySQL database is the
  `schema_name`): `{nil "My MySQL"}`;
- `:schema-mapping` maps a dbt `schema_name`;
- `:collection-name` defaults to `dbt metrics`, written as `collections/main/dbt_metrics.yaml` and `dbt_metrics/`.

Beside it, `convert!` takes the dbt source's own option under `:options`, `{:entity-models {...}}`: entity name to
semantic model name, which semantic model a foreign or unique entity joins to when more than one other semantic model
is keyed by that entity, as its primary entity or as a unique one (see "Entities and dimensions"). An entity exactly
one model is keyed by needs no entry; when several are, an entry naming a model that is not keyed by the entity is
reported.

The `:driver` has to agree with the dbt adapter the manifest was written with (`metadata.adapter_type`, the `type` of
the profile `dbt parse` ran with): `convert!` fails up front when the adapter maps to another driver (`postgres` →
`:postgres`, `bigquery` → `:bigquery-cloud-sdk`, `trino` → `:starburst`, `spark` → `:sparksql`, …; the table is
`dbt.adapter/adapter->driver`), and logs a warning and takes the config at its word when the manifest names no adapter
or one with no Metabase driver (`duckdb`). A column's `data_type` goes through the driver's type mapping; a column the
project does not document, or documents without a `data_type`, is a column of unknown type, and what dbt says about it
is trusted: a `type: time` dimension over it is bucketed by the grain as written, a `sum_boolean` over it counts it as
a boolean, and a division by it is not taken for integer division.

Reading the manifest can fail before anything else does, and every such failure names the file: one that cannot be
read or is not JSON (`Cannot read dbt manifest ...`), one whose JSON is not an object (`Invalid dbt manifest ...: the
file is empty`, or holds an array), one from a dbt release the import does not read (`Unsupported dbt manifest`, see
"Supported dbt versions"), and one that is a v12 manifest but not in the shape the import reads (`Invalid dbt
manifest`, with the schema errors in the exception's data).

### The report

The report is [the import's](../report.md); a dbt metric is listed under its `name`. A metric the parse
stage failed on is listed under `:errors` as `error parsing metric (<class>): <message>`, and a semantic model that
could not be parsed is listed the same way under its own name, with `:kind :table` (`error parsing semantic model
(<class>): ...`), with every metric over it under `:unsupported` as over a semantic model that was not found.
"Limitations" below collects every reason a dbt metric is reported.

### Importing the result

Import the tree and check it first with `preflight`, as [Importing the result](../importing.md) describes. The names it
writes are the ones sync would see, which the import works out from how dbt quoted them: dbt writes `node_relation` and
the column names in the project's spelling, and only the parts it quoted when it built the table reach the warehouse as
written. The manifest records which: `relation_name` is the relation as dbt rendered it
(`"dbt_bi"."public"."fact_sales"` from dbt-postgres, which quotes by default; `analytics.dbt_alice.dim_customers` from
dbt-snowflake, which does not; backticks and square brackets are read too), and `columns[].quote` says whether a
column's name is quoted. A relation with no `relation_name` (an ephemeral model) counts as unquoted throughout. The
end-to-end test under "Fixtures and tests" imports a converted project into a test instance.

### Identifiers and re-import

The ids are [the import's](../ids.md), prefixed `dbt-import/`. A metric's unique id is dbt's `unique_id`,
`metric.<project>.<name>`, built from its `name`, so a metric renamed in dbt is a new card on import, and the old card
stays in the instance; a new `label` or `description` keeps the card and updates it. The collection's id carries the
manifest's `metadata.project_name`, so two dbt projects with the same `project_name` collide only when they are also
mapped to the same Database. A curated dimension's path is dbt's own spelling of it, `<entity>__<dimension>`.

## What converts

### Simple metrics

A simple metric is one aggregation over one semantic model: on the legacy spec the measure the metric points at, on
the dbt 1.12 inline spec the metric's own `agg` and `expr`. The `expr` is a bare column name, the literal `1`, `*`
under `count`, or SQL (see "Filters and SQL expressions" for the SQL subset). The aggregation maps as follows:

| dbt | Metabase |
| -- | -- |
| `sum` of a column or expression | `sum` |
| `sum` of the literal `1`; `count` of `1` or `*` | `count`, a row count |
| `count` of a column or expression | `count-where` the expression is not null, since SQL's `count` skips nulls |
| `count_distinct` | `distinct` |
| `average` | `avg` |
| `min`, `max`, `median` | `min`, `max`, `median` |
| `percentile` with `agg_params.percentile` | `percentile` with the same fraction (dbt takes `0.95`, not `95`); discrete percentiles are reported |
| `sum_boolean` of a boolean column | `count-where` the column is true |
| `sum_boolean` of a SQL condition | `count-where` the condition |
| `fill_nulls_with`, on the metric or its measure | the aggregation wrapped in `coalesce`; reported on a `min` or `max` of a non-numeric column, which the warehouse would reject |
| `join_to_timespine` | ignored: there is nothing to join a scalar metric to |
| `filter`, on the metric or its measure | one filter clause per `where_sql_template`, see "Filters and SQL expressions" |
| `agg_time_dimension` | the metric's default dimension, see "Entities and dimensions"; one that is not a dimension of the model is reported under the metric's `:unsupported-dimensions` |
| `non_additive_dimension` | reported, see "Limitations" |

Any other aggregation over a literal (`average` of `1`, `sum` of `2`) has no Metabase equivalent and is reported.

### Metrics that compose other metrics

Ratio, derived and cumulative metrics refer to other metrics (on the legacy spec a cumulative one refers to a
measure). On the legacy spec they are top-level `metrics:` entries; on the inline spec they sit under a model's
`metrics:` like the simple ones (the `parcel_delivery` fixture's `daily_depot_volume.yml` has a ratio and a derived
metric there). They convert as follows; the metrics they refer to are written before them.

| dbt | Metabase |
| -- | -- |
| `ratio` of `numerator` to `denominator` | one metric card whose aggregation divides `[:metric ...]` references to the input metrics' cards |
| `derived` with `expr` over `metrics` | the same arithmetic over `[:metric ...]` references, aliases resolved; `x / nullif(y, 0)` is `x / y` |
| an input (`numerator`, `denominator`, `metrics[]`) with its own `filter` | inlined as the filtered form of the input's aggregation, with the input's own filters and the reference's combined, so the metric stays one card: `count-where` for a count or `sum_boolean`, `distinct-where` for a `count_distinct`, and for a `sum`, `average`, `min`, `max`, `median` or `percentile` the aggregation over a `case` that is the expression where the filter holds and null elsewhere, which the aggregation skips. That is how the query processor splices a filtered metric into a query, and it gives null, as MetricFlow's outer join does, for a group no row of which passes the filter, where `sum-where` would give 0; a count gives 0 for such a group, as it does when the metric itself is filtered. The input's own `fill_nulls_with`, if it has one, is inlined too, as a `coalesce` around the filtered aggregation |
| `cumulative` with no window and `period_agg: last` over a `sum`, a row count or a `count` of a column | `cum-sum` / `cum-count`, or for a `count` of a column (which skips nulls) `cum-sum` of a `case` that is 1 where the column is not null; the metric's filters apply as on a simple metric. The metric carries a note (see "The report"): the running total is right with the metric's `agg_time_dimension` as the finest breakout and runs across the categories under any other, see "Limitations". A running `sum_boolean` is reported like a running `count_distinct` or `average`: it is a count of the rows where a condition holds, and its running form is not a `cum-count` |
| `fill_nulls_with` on a `ratio` or `derived` metric | the arithmetic wrapped in `coalesce`, as on a simple metric; an input's own `fill_nulls_with` stays on the input's card, which the `[:metric ...]` reference points at, unless the input is inlined for a filter of its own (above) |
| `conversion` | out of scope, reported |

The inputs of a ratio or derived metric have to be on one semantic model, since a metric queries one table. Every
other form is reported with the reason: a cumulative `window` or `grain_to_date`, a cumulative `period_agg` of
`first` (dbt's default when none is written) or `average`, a cumulative metric over an aggregation other than a sum or
a count (a `sum_boolean` included), an input with an `offset_window` or `offset_to_grain`, a `filter` on an input that
is not a simple metric. "Limitations" lists them all with the reasoning. `period_agg` only matters when the metric is
queried coarser than its grain, but that is exactly where the number would silently differ, so a project has to say
`period_agg: last` to convert a cumulative metric.

### Entities and dimensions

Each metric card is written with a curated dimension set (`dimensions` and `dimension_mappings`), so it can be broken
out in the UI as soon as it is imported:

- Every dimension of the metric's own semantic model whose `expr` is a column becomes a dimension of the metric's
  table. A time dimension's `time_granularity` is its default temporal unit, when Metabase can bucket the column by it:
  a typed column takes the units Lib allows its type, and a column the project does not type takes the grain as
  written, since dbt says it is a time dimension; the instance's own metadata decides when the card runs (the import
  binds any name, see `preflight` under "Importing the result").
- Every foreign or unique entity of the model joins to the other semantic model that is keyed by an entity of the same
  name: one that has it as its primary entity or as a unique entity, either of which identifies one row. (These are
  the joins MetricFlow itself allows, except that a model's primary entity is not followed to another model keyed by
  it: it names the model's own dimensions in filters, and the dimension set stays with that.) That model's dimensions
  become dimensions of the metric too, reached by an implicit join: the mapping's target names the joined column with
  `:source-field` set to the entity's column on the metric's table, the same way Metabase represents a column reached
  through a foreign key. The instance has to know that foreign key, through sync or a Field edit, for the breakout to
  run. No explicit join clause is written to the query. Both semantic models have to be in the same Metabase database.
  In the IR each such entity is a join of the metric's table, and the primary entity an alias of it (`dbt.joins`);
  when more than one other model is keyed by the entity, the `:entity-models` option says which one it joins to.
- The measure's `agg_time_dimension` (the model default or the measure's own) is the metric's default dimension; one
  that is not a dimension of the model is reported under the metric's `:unsupported-dimensions`. A metric
  `time_granularity` (dbt's coarsest grain for querying the metric, standard or from a custom calendar) becomes that
  dimension's default temporal unit instead of its own `time_granularity`, so a user breaking the metric out by time
  gets the metric's grain first. Metabase cannot hold a breakout to a grain, so a finer breakout is still a click
  away; a grain Metabase has no unit for, or cannot bucket the column by, is reported.
- A metric's free-form `meta` (the flexanalytics project puts `format` and `synonyms` there) is parsed into the IR and
  written nowhere: a card's `visualization_settings` key number formatting by column name, which a metric's
  aggregation does not have until it is run, so there is no place to put a `format` without guessing at the project's
  own convention for it.

Dimension ids are derived from the metric's dbt unique ID and the dimension's reference, so a re-run writes the same
ids and a re-import updates the dimensions in place. Every dimension is written with the status `active`, the status
the instance gives a dimension whose column it finds, so the instance's first refresh of the set after the import
changes nothing. Groups are named after the semantic model's label, or its table, and their ids are derived from that
name; the groups the instance computes for the same table are named differently (see "Limitations"). A dimension's
display name is its dbt `label`, or, when it has none, its name humanized the way Metabase names a Field (`date_day`
is "Date Day"). Dimensions are named after the dbt dimension, except that no two dimensions of a metric share a name:
a joined dimension named like another dimension of the set (a `status` on both the fact table and `dim_order`) is
named by its dbt reference instead, `order__status`, the way dbt itself tells the two apart. Its display name, column,
group and id are unchanged, so two dimensions may still share a display name, as two same-named columns of the
metric's table and a joined table do in Metabase; their groups tell them apart.

A dbt dimension that cannot be a curated dimension, because its `expr` is SQL, because it bounds a slowly changing
dimension's validity window, or because the join behind its foreign entity cannot be made, is listed per metric under
`:unsupported-dimensions` in the report rather than dropped; "Limitations" lists the cases.

### Filters and SQL expressions

A measure's `expr` may be SQL rather than a column, and a metric or measure may carry a `filter` of Jinja-wrapped
MetricFlow references around SQL. The SQL is the warehouse's, and the subset of it that converts is the import's: see
[SQL in the IR](../sql.md), with its [caveat on weeks](../sql.md#weeks), which dbt, like ISO, starts on Monday.

`dbt.filters` stands a placeholder in for each MetricFlow reference in a `where_sql_template` and says what it refers
to in the IR's terms (`::ir/reference`):

| MetricFlow | IR reference | What it resolves to |
| -- | -- | -- |
| `Dimension('<dimension>')`, or through the model's primary entity, `Dimension('<entity>__<dimension>')` | a dimension of the metric's table, with no path or a path through an alias of the table | the dimension's `expr`: its column, or, for SQL, that expression inlined, so a SQL dimension can be filtered on even though it cannot be a curated dimension |
| `Dimension('<entity>__<dimension>')` through a foreign or unique entity | a dimension through the join the entity is | the column of the semantic model keyed by the entity, reached through the entity's column (an implicit join); a join that cannot be made reports the metric |
| `TimeDimension('<...>', '<grain>')`, or `Dimension('<...>').grain('<grain>')` | the same, bucketed by the grain (by the dimension's own when `TimeDimension` names none) | the column bucketed by the matching Metabase temporal unit; a SQL dimension cannot be bucketed and is reported |
| `metric_time`, in either of the above | the metric's time dimension | the measure's `agg_time_dimension` |
| `Entity('<name>')` | a key of the metric's table | the entity's `expr`, column or SQL |

A `fiscal_quarter` grain is read as `quarter`, until custom calendars are supported. The SQL around the references is
parsed with the placeholders left in it, and a bare identifier that is not a reference (`status = 'x'` next to a
`{{ Dimension(...) }}`) is read as a column of the metric's own semantic model, by name, with no check that the project
documents it: an undocumented name becomes a column of unknown type, as it would in a measure's `expr`, and only
`preflight` or the running card finds out. A template with no reference at all is reported. `Metric(...)` references
are reported (see "Limitations"), and so is a reference with any argument beyond its name and grain, such as
`Dimension('customer__region', entity_path=['order'])`: the import reaches a dimension through the entity named in the
reference and cannot follow another path. Any other method chained onto a reference (`.date_part('month')`) is
reported too, and so is Jinja that is not one of those four references (`{{ var('x') }}`, `{% if %}`, `{# #}`), inside a
string literal included, as Jinja the import could not parse. All of these are reported when the manifest is parsed.

## Limitations

A Metabase metric is one aggregation over one table, optionally filtered, with a curated set of dimensions it can be
broken out by. Whatever dbt can say that does not fit that shape is not approximated: the import reports each case
and moves on. A metric it cannot convert is listed in the report's `:unsupported` with the reason, and a dbt dimension
that cannot become a curated dimension is listed under the metric's `:unsupported-dimensions` while the metric itself
still converts.

The tables below list the cases a real project runs into, with an example of the dbt that triggers them, why they are
not supported, and what it would take to support them: a change to the import, to MBQL, or to Metabase metrics
themselves. Cases dbt validates against or that nobody writes (a `TimeDimension` over a categorical dimension, a
`sum` of a literal, a metric that refers to itself) are reported with a message like everything else but are not
listed. Examples are in the legacy spec unless they say otherwise; the inline spec reports the same things.

Two things are not limitations of the conversion but are checked before it: the manifest has to come from dbt 1.12 or
later (see "Supported dbt versions"), and the import reads only `semantic_models`, `metrics` and the model `nodes`
they are defined on. Saved queries, exports and the time spine are never read.

### Metric types

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| `conversion` metrics | `type: conversion` with `base_measure: visits`, `conversion_measure: purchases`, `entity: user`, `window: 7 days` | A funnel counts, per entity, a base event followed by a conversion event within a window: a self-join with a time condition. A metric is one aggregation over one table. | A new kind of Metabase metric, a funnel over two events of an entity. MBQL has no self-join with a time window to build it on either. |
| `cumulative` with a `window` | `type: cumulative`, `type_params: {measure: revenue, window: 7 days}` (inline spec: `cumulative_type_params: {window: 7 days}`) | A trailing window is a rolling-window aggregation, which MBQL does not have. The running total minus the running total seven rows back would nest window functions, which SQL does not allow. | Extend MBQL with a windowed cumulative aggregation (`cum-sum` over a trailing span of time), compiled to a window frame. |
| `cumulative` with `grain_to_date` | `type_params: {measure: revenue, grain_to_date: month}` | A running total that resets each month needs a month breakout, and a metric cannot require one. The query processor does partition a cumulative aggregation by every breakout but the finest temporal one, so a user who breaks out by month *and* day gets month-to-date, but under a day breakout alone `cum-sum` is the all-time running total. | Extend MBQL so a cumulative aggregation can name the grain it resets at, then let a metric definition carry it. |
| `cumulative` over anything but a `sum` or a `count` | `type: cumulative` over a measure with `agg: count_distinct` (or `average`, `min`, `max`, `median`, `percentile`, `sum_boolean`) | MBQL's only running aggregations are `cum-sum` and `cum-count`. SQL does not allow `DISTINCT` in a window function, and there is no running average, min, max or percentile. (A running `count` of a column, which skips nulls, converts: it is the `cum-sum` of a `case` that is 1 where the column is not null; a `sum_boolean`, a `count-where`, has no such form yet.) | Running average, min and max: extend MBQL with the window-function aggregations; a running `sum_boolean` could be the `cum-sum` of a `case` the way a running `count` is. A running distinct count cannot be written in SQL at all. |
| `cumulative` with `period_agg: first` (dbt's default) or `average` | `type: cumulative`, `type_params: {measure: revenue}` with no `cumulative_type_params`, or `cumulative_type_params: {period_agg: first}` | `period_agg` says which value of the running total stands for a period when the metric is queried coarser than its grain: the value on the period's first day, its last day, or the average over its days. Metabase's `cum-sum` under a month breakout is the total through the end of the month, which is `last`; `first` leaves out the period's own rows and `average` is a mean of running totals, and neither can be written as one aggregation. | Nothing for a project that can write `period_agg: last`, the one value that converts; otherwise extend MBQL so a cumulative aggregation can name the value it takes per period. |
| a `ratio` or `derived` input with `offset_window` | `metrics: [{name: revenue}, {name: revenue, offset_window: 1 month, alias: revenue_last_month}]` | dbt shifts the input by a fixed span of time. MBQL's `offset` is relative to the rows of the result, so its meaning changes with whatever breakout grain the user picks. | Extend MBQL with an `offset` by a span of time rather than a number of rows, then allow it in metric definitions. |
| a `ratio` or `derived` input with `offset_to_grain` | `metrics: [{name: revenue, offset_to_grain: month, alias: revenue_at_month_start}]` | The value at the start of the current period has no MBQL equivalent at all. | Extend MBQL with a "value at the start of the period" aggregation; in SQL it is a self-join or a window frame bounded at the truncated date. |
| `ratio` or `derived` inputs on different semantic models | `numerator: {name: order_count}` on `orders`, `denominator: {name: customer_count}` on `customers` | A metric queries one table, and the `[:metric ...]` references in its aggregation have to share it. | Extend Metabase metrics so a `[:metric ...]` reference may point at a card on another table, with the query processor combining the two aggregates. |
| a `filter` on an input that is not a simple metric | `numerator: {name: sales_to_target_ratio, filter: "..."}` | An input filter is inlined as the filtered form of the input's measure (`count-where`, or the aggregation over a `case`, see "Metrics that compose other metrics"). A ratio, derived or cumulative input has no single measure to filter. | Extend Metabase metrics with a filtered `[:metric ...]` reference, so the input card is filtered instead of inlined. |
| a `cumulative` metric broken out by anything but its time dimension | `type: cumulative` over `revenue`, queried by `customer__region` | The metric converts, with a note. MetricFlow computes a cumulative metric per time period and then groups the periods, so under a region breakout each region's value is its total to date. Metabase's `cum-sum` runs over the rows of the result in order, partitioned by every breakout but the finest temporal one, so under a region breakout alone it is a running total across the regions in whatever order they come. The two agree when the finest breakout is the metric's `agg_time_dimension`. | Extend MBQL so a cumulative aggregation can name the dimension it runs along, then let a metric definition carry it. |
| a `filter` that references a metric | `filter: "{{ Metric('order_total', group_by=['customer']) }} > 1000"` | A condition on a metric's value is a `HAVING` over a grouped subquery. A metric's aggregation has no place for it. | Extend Metabase metrics with a condition on another metric grouped by an entity, which the query processor would compile to a filtered subquery joined back in. |

### Measures and aggregations

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| `non_additive_dimension` | `non_additive_dimension: {name: metric_time, window_choice: max, window_groupings: [account]}` | A semi-additive measure takes one time slice per group before it aggregates (each account's balance at its latest date). Nothing in MBQL picks a row per group ahead of the aggregation. | Extend MBQL with a "latest row per group" pre-aggregation step (a window-function filter), then let a metric carry it. |
| discrete percentiles | `agg: percentile`, `agg_params: {percentile: 0.5, use_discrete_percentile: true}` | Metabase percentiles are continuous: they interpolate between rows. `percentile_type: continuous` converts. | Extend MBQL with a discrete percentile aggregation (`percentile_disc`), with driver support where the warehouse has it. |
| `sum_boolean` of a column the project types as anything but boolean | `agg: sum_boolean`, `expr: is_returned` where the model documents `is_returned` as `integer` | `sum_boolean` counts the rows where the column is true, which the import writes as `count-where` the column; a column that is not boolean is not a condition, and summing it as one would be a guess at the project's encoding (`1`/`0`, `'Y'`/`'N'`). A column the project does not type is taken at dbt's word, and the warehouse rejects the comparison when the card runs if it is not boolean. | Nothing in Metabase: write the measure's `expr` as the condition (`is_returned = 1`), which converts. |

One flag is accepted and ignored rather than reported: `use_approximate_percentile: true` (inline spec
`percentile_type: continuous`, which dbt writes as this flag) asks the warehouse for an approximate percentile where it
has one (`approx_percentile`, `percentile_approx`). Metabase has one `percentile` (and `median`), which each driver
compiles to what its warehouse has: exact (`percentile_cont`) on Postgres, Redshift, Snowflake, Oracle and SQL Server,
approximate on BigQuery (`APPROX_QUANTILES`), Presto/Trino, Athena and Starburst (`approx_percentile`). So the flag
changes nothing, and the number can differ from dbt's where dbt and Metabase pick differently for the same warehouse;
the import reports nothing about it. A driver with no percentile at all (MySQL, SQLite, H2, Vertica) is caught: a
`median` or `percentile` metric for it is reported, see "Manifest and configuration errors".

### SQL in `expr` and `filter`

A measure's `expr` and a `filter` are parsed with sqlglot and mapped onto MBQL clause by clause; what of the SQL itself
does not map is listed under [What does not convert](../sql.md#what-does-not-convert), with the reasons. What is dbt's
own:

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| a custom calendar granularity | `TimeDimension('order__ordered_at', 'retail_month')`, defined on the project's time spine | Metabase buckets by its standard truncation units, `millisecond` through `year`. `fiscal_quarter` is read as `quarter` until custom calendars are supported. | Custom calendars in Metabase, then a mapping from a dbt custom granularity onto one. |
| a dimension reached through two entities | `Dimension('order__customer__region')` | A dimension mapping is one implicit join, a foreign key on the metric's table to the joined table's key. A two-hop path has no representation. | Extend Metabase metrics so a dimension mapping can carry a multi-hop join path, or so a metric query can hold explicit joins. |
| an `entity_path` argument on a reference | `Dimension('customer__region', entity_path=['order'])` | The import reaches a dimension through the entity named in the reference, as the one implicit join above. A path through other entities is the same multi-hop join, and the argument is reported rather than dropped so that the filter is not resolved against the wrong entity. | The same multi-hop join path as above. |
| a method other than `.grain()` chained onto a reference | `Dimension('metric_time').date_part('month')`, `Dimension('order__status').descending(True)` | `.grain('month')` is read and means what `TimeDimension('...', 'month')` does. `.date_part()` extracts a part of a date (dbt's `dow` and `doy` depend on the first day of the week, see [the caveat on weeks](../sql.md#weeks)), and the rest are ordering hints that mean nothing in a filter; all are reported, naming the call, rather than dropped. | Map `.date_part('year'|'quarter'|'month'|'day')` onto `get-year` and friends; `dow`/`doy` need the week-start agreement below. |
| Jinja other than a MetricFlow reference | `{{ var('status_col') }} = 'x'`, `{{ Dimension(some_macro()) }}`, `status = '{{ var("x") }}'`, `{% if ... %}` | Only `Dimension(...)`, `TimeDimension(...)`, `Entity(...)` and `Metric(...)` with quoted names are read. Anything else, a `{{`, `{%` or `{#` anywhere in the template, inside a string literal included, is reported as Jinja the import could not parse. | Render the filter with dbt (`dbt compile`) before importing, or evaluate the manifest's `var`s in the import. |

### Dimensions and joins

These apply to the curated dimension set and are reported under `:unsupported-dimensions`; the metric converts without
them. A join that cannot be made (the rows about entities and databases below) also makes a metric whose `filter`
goes through it unsupported, since the filter cannot be written. A dimension whose `expr` is SQL, or one with
`validity_params`, is different: a `filter` on it converts, with the SQL inlined or the column compared (see "Filters
and SQL expressions"); it is only the dimension set that cannot carry it.

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| a dimension whose `expr` is SQL | `dimensions: [{name: is_large_order, type: categorical, expr: "amount > 100"}]`, or any `derived_semantics` dimension | A dimension mapping targets a column of the table or of a joined table. There is no place in it for an expression. | Extend Metabase metrics so a dimension mapping can target an expression, or let a table carry computed columns the mapping can point at. |
| a foreign entity whose `expr` is SQL, on either side of the join | `entities: [{name: customer, type: foreign, expr: "cast(customer_key as varchar)"}]` | An implicit join is a foreign-key column pointing at a primary-key column (`:source-field`). | Extend Metabase metrics so the join behind a dimension mapping can be an explicit join on an expression. |
| a join to a semantic model in another Metabase database | `dim_customer` in warehouse database `crm`, mapped to another Metabase Database than the fact table's | An implicit join is a foreign key within one database; Metabase has no cross-database join. | Nothing short of a cross-database join in Metabase. |
| a time dimension with `validity_params` (dbt's SCD type II) | `dimensions: [{name: valid_from, type: time, type_params: {time_granularity: day, validity_params: {is_start: true}}}]` | The dimension bounds the validity window of a slowly changing dimension's versions. A dimension set has no notion of a window, and a breakout by the window's start or end would count every version of a row. Reported under the dimension's name. | A dimension kind that marks a time range rather than a point, and a query processor that joins through it. |
| a `natural` entity, on either side of a join | `entities: [{name: customer, type: natural, expr: customer_id}]` on `dim_customer_scd`, joined to from a fact table's `customer` foreign entity; or a natural entity on the metric's own model that another model is keyed by | MetricFlow joins to a slowly changing dimension through the validity window of its time dimensions, picking the version in effect at the fact's `metric_time`. An implicit join is an equality on one column and cannot express that. Reported once, under the entity's name, naming the model whose dimensions are not reached; a filter through the entity reports the metric. | The same windowed join in Metabase metrics: a dimension mapping whose join is `fk = key and metric_time between valid_from and valid_to`. |
| a semantic model whose `primary_entity` names no entity of its own | `primary_entity: order` on a model with no `entities` entry named `order` (dbt's virtual primary entity, for a model with no key column) | The model is keyed by the virtual entity for filter prefixes, but there is no column to join on, so a foreign entity of the same name on another model cannot reach its dimensions. Every dimension behind it is reported. | Nothing in Metabase: a join needs a column on each side. Declare the key as an entity with an `expr`. |
| a ratio or derived metric `time_granularity` whose inputs disagree on an `agg_time_dimension` | `type: derived`, `time_granularity: month`, over `sales` (measure `agg_time_dimension: order_date`) and `target` (measure `agg_time_dimension: target_date`) | The metric's grain becomes the default temporal unit of its default dimension, the inputs' shared `agg_time_dimension`. When the inputs disagree there is no default dimension to carry it, so the grain is reported under the name `time dimension`; the metric and its dimensions convert at their own grains. | Metabase cannot hold a breakout to a grain; the import would have to pick one input's time dimension, which is not what dbt means. |

Dimension groups carry dbt's labels, by design: a group is named after the semantic model's `label` (or its table name
when it has none), and its id is derived from that name the same way Metabase derives a group's id from its display
name, so a re-run writes the same names and ids. They are not the names or ids the instance computes for the same
table: the instance names the main group after the table's display name (`Fact Sales` for `fact_sales`) and a
connection group after the foreign key field's display name (`Order Key`), not after the semantic model's label
(`Sales Fact`, `Order`). So the imported groups are stable across re-imports, and a dimension added later in the UI
sits in a sibling group next to the imported one rather than in it.

An entity's `role` (`entities: [{name: user, type: foreign, expr: buyer_id, role: buyer}]`, dbt's label for one of
several entities that point at the same thing) is read nowhere: the join behind a dimension is made on the entity's
name, as MetricFlow makes it, and a dimension mapping has no place for a role. Two entities of one model that join to
the same other model each bring that model's dimensions, told apart by their names (see "Entities and dimensions").

### Manifest and configuration errors

These are reported the same way, but they are fixed in the project, the config or the driver rather than being limits
of the conversion:

- A warehouse database with no entry in the config's `:databases`.
- A column declared with a `data_type` the config's `:driver` has no base type for. Drivers are meant to map every
  type their warehouse has, so the fix is a mapping in the driver (the way `bytea` became `:type/Binary` on Postgres
  for this tool), not a setting in the config.
- A `:driver` that is not a JDBC driver (`:mongo`, `:bigquery-cloud-sdk`): the import types columns through the
  driver's sql-jdbc type mapping, which only a JDBC driver has, so the run fails before anything is written.
- A metric whose query needs a feature the config's `:driver` does not have: a `median` or `percentile` on MySQL,
  SQLite, H2 or Vertica, a regex (`~`, `SIMILAR TO`, a `LIKE` pattern the regex fallback takes) on SQL Server or
  SQLite, a `cast` to an integer on H2, a cumulative metric on Spark. The driver's own feature flags say what it has;
  the metric would import and fail when queried, so it is reported, naming the clause and the feature.
- A metric whose semantic model, measure or input metric is not in the manifest, for example because it is disabled.
- A manifest that disagrees with itself: a ratio or derived input, or an inline-spec cumulative metric's
  `cumulative_type_params.metric`, naming a metric other than the one its `depends_on` resolved to, or
  `metric_aggregation_params` naming another semantic model, or an `expr`, than `type_params` and `depends_on` do.
  dbt writes both sides from one definition, so this is a hand-edited manifest, and the metric is reported rather
  than read one way or the other.
- An exception the import did not anticipate while parsing or resolving one metric (or parsing one semantic
  model): a bug, or an input outside what it reads. It is logged with its stack and listed under the report's
  `:errors`, apart from the `:unsupported` metrics, which are the cases the import chose not to convert.
- A foreign or unique entity that more than one other semantic model is keyed by (`customer` declared `type: primary`
  on both `dim_customer` and `dim_customer_history`, or `primary` on one and `unique` on the other) with no entry in
  the `:entity-models` option naming the model it joins to, or an entry naming a model that is not keyed by it. An
  entity no other model is keyed by is just a key and reports nothing.
- A metric `time_granularity` Metabase has no temporal unit for (a custom calendar grain, or `hour` on a date
  column); see "Entities and dimensions".
- A `percentile` outside 0 and 1. dbt takes the percentile as a fraction (`0.95`) and nothing else, and so does the
  import: `95` is reported rather than read as 95%, since `1.5` could not be and the two readings would have to
  meet somewhere.
- A warehouse whose rule for an unquoted identifier is not its driver's: a Snowflake account with
  `QUOTED_IDENTIFIERS_IGNORE_CASE` (quoted names upper-cased too), a case-preserving warehouse (MySQL, SQL Server,
  SQLite, BigQuery) whose project writes mixed-case names unquoted, an H2 database with `DATABASE_TO_UPPER=FALSE`. The
  import writes the driver's default and `preflight` reports the mismatch; the fix is `:identifier-case` in the
  config (`:as-is` for the spelling kept, `:upper` or `:lower` for a fold the driver does not know of), and
  `:schema-mapping` when the schema is what differs. Neither is read from the warehouse: the import never connects
  to it.

## Fixtures and tests

### The test fixtures

Two manifests under `enterprise/backend/test_resources/semantic_layer_import/dbt/`, one per way of writing a dbt
semantic layer, both trimmed to the
sections the import reads and both written by `dbt parse` under dbt 1.12.6 (manifest schema v12). That is the only
kind of manifest the import accepts, see "Supported dbt versions".

`flexanalytics_manifest.json` is the flexanalytics project's manifest, on the **legacy spec** (top-level
`semantic_models:` with `measures:`, and `metrics:` pointing at a measure), plus the nine metrics in
`flexanalytics_extra_metrics.yml`: the project only defines simple metrics, so that file adds two ratio, three
derived and three cumulative metrics and one conversion metric, in the shape dbt itself writes. Between them and the
`parcel_delivery` fixture's ratio, derived and cumulative metrics, the "Metrics that compose other metrics" table has
a real-dbt fixture for a ratio, a derived metric with and without aliases, an input with its own `filter`, a
cumulative `sum` with `period_agg: last`, a conversion metric, and for the reported cumulative `window` and
`grain_to_date`, the `offset_window` and a cumulative metric over a `count_distinct`. The other rows and reported
cases (`fill_nulls_with` on a composed metric, `cum-count`, a cumulative `count` of a column, `period_agg: first` or
`average`, `offset_to_grain`, inputs on different models, a filter on a non-simple input) are covered by the
hand-built manifests in `advanced_metrics_test.clj` only. `sales_to_target_ratio_2` is the
correct ratio form of the project's `sales_to_target`, which averages a per-row `sales / target`; both are kept. To
run the extra metrics in a dev instance, paste them into the clone's `semantic_models.yml` under `metrics:` and
`dbt parse` it the same way.

`parcel_delivery_manifest.json` is the manifest of the small project checked in under `parcel_delivery/`, on the
**dbt 1.12 inline spec**, see the next section. It is the shape of four redacted models from a customer's project,
renamed onto a parcel-delivery domain with the BigQuery types turned into Postgres ones: four semantic models, nineteen
metrics covering every aggregation the inline spec allows except `sum_boolean`, `median` and `min`/`max`, a ratio, a
derived metric, two cumulative metrics (both over a `count_distinct`, so both are reported), filters, a SQL `expr`,
and `derived_semantics` SQL dimensions. `inline_spec_test.clj` pins down what the parser makes
of it and what the pipeline converts.

The fixture generators are test code, under `dbt/test_util/` in the test tree. Regenerate a fixture after changing
its project (or the clone, or the extra metrics), from a REPL at the repo root started with the `:ee-dev` alias:

```clojure
(require '[metabase-enterprise.semantic-layer-import.dbt.test-util.fixture :as fixture])

(fixture/regenerate! :parcel-delivery)
(fixture/regenerate! :flexanalytics)   ; the clone at ~/dbt-business-intelligence
(fixture/regenerate! :flexanalytics {:project "/path/to/dbt-business-intelligence"})
```

`fixture/regenerate!` checks that the REPL runs at the repo root, copies the project to a scratch
directory (a git checkout's tracked and untracked files, or a plain directory's) with a `profiles.yml` of its own, so
that `dbt parse` has the adapter and the warehouse database name it needs (it never connects, and the project itself
is never modified), splices the extra metrics in for flexanalytics, and runs `dbt parse` through `uvx` with `dbt-core`
pinned to the release `fixture/dbt-version` names (1.12.6) and `dbt-postgres` to
`fixture/dbt-postgres-version` (1.11.0; its transitive dependencies are not pinned), or as whatever
`dbt` is on `PATH` when there is no `uvx`; a manifest another release wrote is refused, since the fixtures and the
tests that pin what is in them would drift with it. It writes the trimmed result the way Python's
`json.dumps(indent=1)` would, with keys in dbt's order, so a regeneration's diff is only what changed, plus dbt's
`created_at` and `generated_at` timestamps. `marts/regenerate!`, below, reuses the same scratch copy to
build the project.

dbt runs the project's code (its macros and hooks), so only regenerate from a checkout you have reviewed. Two
safeguards narrow what that code can get at:

- dbt and `uvx` get a trimmed environment, not yours: `PATH`, `HOME`, `USER`, `LOGNAME`, `LANG`, `LC_*`, `TMPDIR`,
  `TMP`, `TEMP`, `UV_*`, `XDG_*`, the `*_proxy` variables and `SSL_CERT_FILE`/`SSL_CERT_DIR` (see
  `fixture/dbt-env`), plus `DBT_PROFILES_DIR` pointing at the scratch profile. Your own `DBT_*`
  variables stay out, so they cannot send dbt elsewhere, and so does everything else, so a project's
  `{{ env_var('X') }}` cannot copy a secret from your shell into the manifest and from there into a fixture file in
  the repo (descriptions survive the trimming). A project that needs a variable fails to parse, naming it.
- `dbt deps` does not run unless asked: it fetches and runs other people's packages. A git checkout's installed
  `dbt_packages` is copied along, which is enough for the flexanalytics project once you have run `dbt deps` in the
  checkout yourself (after reading its `packages.yml`); a project that declares packages without them installed is
  refused, unless you pass `{:deps? true}`. The checked-in `parcel_delivery` project declares none.

### The dbt 1.12 inline spec

dbt 1.12 lets a project declare its semantic layer on the models themselves instead of in separate top-level blocks:
`semantic_model:` nested under the entry in `models:`, `entity:` and `dimension:` on the entries under `columns:`,
`agg_time_dimension` on the model, further SQL dimensions under `derived_semantics:`, and `metrics:` on the model
with their own `agg` and `expr` and no `measures:` list anywhere. Composed metrics sit under a model's `metrics:` too,
with new keywords: a ratio's `numerator` and `denominator` stand alone, a derived metric lists `input_metrics`, and a
cumulative one names its `input_metric` and a `period_agg`. (dbt also insists on a time spine model before it will
parse any metric; `parcel_delivery/models/time_spine.sql` is the smallest one that satisfies it, and the import
never reads it.)

The bet behind reading `manifest.json` rather than the YAML was that dbt normalizes both specs into the same
`semantic_models` plus `metrics` structure. It does, with three differences the parser handles:

- A semantic model's `measures` is empty. Every aggregation is on a metric.
- A simple metric carries `type_params.metric_aggregation_params` (`semantic_model`, `agg`, `agg_params`,
  `agg_time_dimension` already defaulted from the model, `non_additive_dimension`) with the expression next to it in
  `type_params.expr`. dbt documents a missing `expr` as meaning the column is the metric's name, and the parser
  defaults it that way; every metric of the fixture writes an `expr`, so the fixture does not exhibit it.
  `agg_params` is written for every aggregation, and `percentile_type: continuous` comes out as
  `use_approximate_percentile: true`, not as a discrete percentile.
- A cumulative metric depends on the simple metric it runs over (`cumulative_type_params.metric` and `depends_on`),
  not on a semantic model. The parser takes that metric's aggregation, semantic model and filters; a window or
  `grain_to_date` is reported as on the legacy spec.

Entities and dimensions come out exactly as on the legacy spec, including a primary entity declared without a name,
which dbt names after its column, and the `derived_semantics` dimensions, which arrive with their SQL as `expr`.
Everything after the parser is none the wiser: the inline-spec fixture's simple, ratio and derived metrics convert to
the same clauses the legacy one's do, and its two cumulative metrics, both over a `count_distinct`, are reported as a
legacy-spec one over a `count_distinct` is.

### Running the tests

The tests live under `enterprise/backend/test/metabase_enterprise/semantic_layer_import/dbt/`, apart from the two that
are not dbt's (see [Tests](../tests.md)), and the regular backend test run picks them up. Run them in a fresh JVM with

```sh
./bin/test-agent :module enterprise/semantic-layer-import
```

or one namespace with `./bin/test-agent :only '[metabase-enterprise.semantic-layer-import.dbt.parse-test]'`. From a REPL
started with the `:ee` and `:ee-dev` aliases, require and run them as any other test namespace. The end-to-end test
needs a Postgres warehouse and passes with no assertions without one; see "The end-to-end test".

`core-test` runs the whole pipeline on the fixtures and pins the report's shape; `adapter-test` covers the adapter's
driver and the check against it, and `preflight-test` the pre-import check against an app DB; `generative-test` runs
manifests generated from the manifest schemas through parse and resolve, checking that nothing escapes as an
exception; `identifiers-test` covers how dbt's quoting and the driver's folding rule decide the emitted table and
column names; `test-util.fixture-test` and `test-util.marts-test` cover the parts of the two generators that need
neither dbt nor Postgres (what gets copied, what the manifest is trimmed to, the environment dbt gets, how the password
is kept off the screen and out of the JDBC URL).

All but the end-to-end test need no warehouse: they run the fixtures and small hand-built manifests through the
pipeline and compare the clauses that come out.

### The end-to-end test

`e2e_test.clj` is the import described under "Importing the result" as a test: it loads the
project's mart tables into a Postgres test dataset, converts the fixture manifest for that database, imports the YAML
with serdes, and checks that every converted metric returns the number a hand-written SQL query does, that the
curated dimensions break a metric out through their implicit joins, that the cards came through with result metadata,
and that importing a second time updates the cards instead of duplicating them. It runs on Postgres only: the manifest
names its tables `public.fact_sales` and so on, serdes binds a field ref by exact name, and a Postgres test dataset is
called exactly that, where H2 would upper-case it. Run it by name with the Postgres driver enabled:

```sh
./bin/test-agent --drivers=postgres :only '[metabase-enterprise.semantic-layer-import.dbt.e2e-test]'
```

The dataset is `flexanalytics_marts.edn`, next to the manifests, the four mart tables the semantic models are defined
on (`fact_sales`, `dim_customer`, `dim_product`, `dim_order`; `dim_date` has no semantic model), in the format of
`test/metabase/test/data/dataset_definitions/*.edn`, with dbt's surrogate keys as primary and foreign keys so a sync
knows the joins. Regenerate it after the checkout changes, from a REPL at the repo root with a Postgres to build the
project in (the connection defaults to the test suite's `MB_POSTGRESQL_TEST_*` settings; the database `dbt_bi` has
to exist). The password is a separate argument, not a key of `:connection`, so that a typo in the options cannot put
it on the screen (a failed schema check reports the value it was given):

```clojure
(require '[metabase-enterprise.semantic-layer-import.dbt.test-util.marts :as marts])

(marts/regenerate!)
(marts/regenerate! {:connection {:port 15432, :user "postgres"}} "password")
```

It builds the project in the same kind of scratch copy `fixture/regenerate!` uses, with the same
trimmed environment and the same stance on `dbt deps` (`{:deps? true}` to allow it), with `dbt seed` and `dbt run`
against that Postgres, and dumps the tables.
