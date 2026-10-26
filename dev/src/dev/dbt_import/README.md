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

Then open each metric in the UI, run it, and compare the number against a hand-written SQL query.

## Filters and SQL expressions

A measure's `expr` may be SQL rather than a column, and a metric or measure may carry a `filter` of Jinja-wrapped
MetricFlow references around SQL. Both go through sqlglot (`metabase.sql-parsing.core/parse-expression`, used by
`dev.dbt-import.sql`), which parses an expression on its own in the dialect of the config's `:driver`, and a small
subset of SQL maps onto MBQL: column references, literals, `+ - * /`, comparisons, `AND`/`OR`/`NOT`,
`IN`, `BETWEEN`, `IS [NOT] NULL`, `LIKE` with a `%x%`, `x%` or `%x` pattern, and `CASE WHEN ... THEN ... ELSE ... END`.
Functions, casts and anything else are reported as unsupported, naming the construct.

In a filter, `Dimension('<entity>__<dimension>')` resolves to one of the metric's own columns when the entity is the
semantic model's primary entity, and `TimeDimension(..., '<grain>')` additionally buckets it by the matching Metabase
temporal unit; `metric_time` is the measure's `agg_time_dimension` and `Entity('<name>')` is that entity's column. A
dimension reached through any other entity lives on another semantic model and is reported as needing a join
(QRES-4); `Metric(...)` references are reported as QRES-5.

Pipeline: `parse` (manifest -> IR) -> `resolve` (IR + config -> Lib queries against a metadata provider built from the
manifest, entity ids) -> `emit` (serdes YAML, with serdes' own MBQL export turning the provider's ids back into
names). MBQL is never written or read by hand: queries are built with `metabase.lib.core` and what the converter needs
to know about them comes from Lib. Each stage only knows the previous stage's schema, see `dev.dbt-import.schemas.*`.
