# Ingestion Steps

## Clone Flexanalytics Repo

```sh
git clone https://github.com/flexanalytics/dbt-business-intelligence
```

## Create dbt config (so it uses the correct SQL dialect plugin for macros):

Save this in `~/.dbt/profiles.yml`:

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
every metric that could not be converted with the reason. Nothing is silently dropped. Entity IDs are derived from
the dbt metric's unique ID, so re-running and re-importing updates the existing cards instead of duplicating them.

The output is a serdes tree, `collections/main/<collection>.yaml` plus one card per metric under
`collections/main/<collection>/`, in the same format `export` produces. Import it into the instance from QRES-2:

```sh
MB_DB_CONNECTION_URI=... clojure -M:run:ee import /path/to/serdes-out -e
```

Then open each metric in the UI, run it, and compare the number against a hand-written SQL query. The end-to-end
test below does the same thing against a test instance.

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

## The test fixture

`dev/resources/dbt_import/flexanalytics_manifest.json` is the project's manifest trimmed to the sections the converter
reads, plus the metrics in `flexanalytics_extra_metrics.yml`: the project only defines simple metrics, so that file
adds one of each type that composes other metrics (ratio, derived, cumulative) and a conversion metric, in the shape
dbt itself writes. `sales_to_target_ratio_2` is the correct ratio form of the project's `sales_to_target`, which
averages a per-row `sales / target`; both are kept. Regenerate the fixture after changing either file or the clone,
from a REPL at the repo root:

```clojure
(dev.dbt-import.fixture/regenerate!)                                                   ; ~/dbt-business-intelligence
(dev.dbt-import.fixture/regenerate! {:project "/path/to/dbt-business-intelligence"})
```

It copies the clone to a scratch directory, splices the extra metrics into `models/semantic_models.yml`, runs
`dbt parse` there (through `uvx` unless `dbt` is on PATH, with the `profiles.yml` above) and writes the trimmed result
in the format dbt writes, so a regeneration's diff is only what changed. The clone is not modified. To run the extra
metrics in a dev instance (QRES-2), paste them into the clone's `semantic_models.yml` under `metrics:` and `dbt parse`
it the same way.

## Filters and SQL expressions

A measure's `expr` may be SQL rather than a column, and a metric or measure may carry a `filter` of Jinja-wrapped
MetricFlow references around SQL. Both go through sqlglot (`metabase.sql-parsing.core/parse-expression`, used by
`dev.dbt-import.sql`), which parses an expression on its own in the dialect of the config's `:driver`, and a small
subset of SQL maps onto MBQL: column references, literals, `+ - * /`, comparisons, `AND`/`OR`/`NOT`,
`IN`, `BETWEEN`, `IS [NOT] NULL`, `LIKE` with a `%x%`, `x%` or `%x` pattern, and `CASE WHEN ... THEN ... ELSE ... END`.
`x / NULLIF(y, 0)` is plain division, since Metabase's `/` already returns NULL for a zero divisor. Other functions,
casts and anything else are reported as unsupported, naming the construct.

In a filter, `Dimension('<entity>__<dimension>')` resolves to one of the metric's own columns when the entity is the
semantic model's primary entity, and `TimeDimension(..., '<grain>')` additionally buckets it by the matching Metabase
temporal unit; `metric_time` is the measure's `agg_time_dimension` and `Entity('<name>')` is that entity's column. A
dimension reached through a foreign entity is on the semantic model that entity is primary for, and resolves to that
model's column joined implicitly through the entity's column (see "Entities and dimensions"); `Metric(...)` references
are reported (see "Advanced metric types").

## Advanced metric types

Metrics that compose other metrics (QRES-5) are always top-level `metrics:` entries. They convert as follows; the
metrics they refer to are written before them.

| dbt | Metabase |
| -- | -- |
| `ratio` of `numerator` to `denominator` | one metric card whose aggregation divides `[:metric ...]` references to the input metrics' cards |
| `derived` with `expr` over `metrics` | the same arithmetic over `[:metric ...]` references, aliases resolved; `x / nullif(y, 0)` is `x / y` |
| an input (`numerator`, `denominator`, `metrics[]`) with its own `filter` | inlined as `sum-where`, `count-where` or `distinct-where` over the input's measure, with the input's own filters and the reference's combined, so the metric stays one card; an input whose aggregation has no filtered form (`average`, `min`, `max`, `median`, `percentile`) is reported |
| `cumulative` with no window over a `sum` or a row count | `cum-sum` / `cum-count`; the metric's filters apply as on a simple metric |
| `conversion` | out of scope, reported |

Not converted, and reported with the reason, because a Metabase metric is a scalar aggregation with no breakout of
its own and MBQL has no clause for them:

- `cumulative` with `window` (a trailing window, `7 days`): MBQL has no rolling-window aggregation. Running total minus
  the running total seven rows back would nest window functions, which SQL does not allow.
- `cumulative` with `grain_to_date` (`month` to date): a running total that resets at each grain. The query processor
  does partition a cumulative aggregation by every breakout except the finest temporal one, so a user who breaks out
  by month *and* day gets month-to-date, but a metric definition cannot require that breakout, and under a day breakout
  alone a plain `cum-sum` would be the all-time running total.
- `cumulative` over anything but a sum or row count: SQL does not allow `DISTINCT` in a window function, and MBQL has
  no running average, min, max or percentile.
- `derived` inputs with `offset_window` (period over period) or `offset_to_grain`: MBQL's `offset` is relative to the
  rows of the result, so its meaning changes with the breakout grain the user picks, while dbt's offset is a fixed span
  of time; `offset_to_grain` (the value at the start of the grain) has no MBQL equivalent at all. Metric definitions
  (`metabase.lib-metric`) also only allow arithmetic over `[:metric ...]` and `[:measure ...]` leaves.
- `conversion`: a per-entity funnel (a base event followed by a conversion event within a window) is a self-join with a
  time condition, nothing a metric expresses.
- a filter template that references `Metric(...)`: a condition on a metric's value is a HAVING, which a metric has no
  place for.

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

A dimension mapping targets a column, never SQL, so a dimension whose `expr` is SQL (`case when ...`) cannot be a
curated dimension; neither can the dimensions behind a foreign entity whose join column is SQL on either side, or
whose entity no semantic model, or more than one, is primary for. These are listed per metric under
`:unsupported-dimensions` in the report rather than dropped. A foreign entity no model is primary for is just a key
and reports nothing.

Pipeline: `parse` (manifest -> IR) -> `resolve` (IR + config -> Lib queries against a metadata provider built from the
manifest, entity ids) -> `emit` (serdes YAML, with serdes' own MBQL export turning the provider's ids back into
names). MBQL is never written or read by hand: queries are built with `metabase.lib.core` and what the converter needs
to know about them comes from Lib. Each stage only knows the previous stage's schema, see `dev.dbt-import.schemas.*`.
