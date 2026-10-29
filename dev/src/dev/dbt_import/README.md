# dbt metrics → Metabase metrics

A developer tool, under `dev/`, that reads the `manifest.json` a dbt project writes and turns the metrics of its
semantic layer into Metabase metric cards, as a serdes export tree that `import` loads. Each dbt metric becomes one
card: one aggregation over one table, filtered as the metric is, with a curated set of dimensions it can be broken out
by. What dbt can say that Metabase cannot is reported, metric by metric, with the reason, and the run goes on.

The pipeline is three stages, each knowing only the previous stage's schema (see `dev.dbt-import.schemas.*`):

1. `parse` (`dev.dbt-import.parse`): the manifest, decoded against `dev.dbt-import.schemas.dbt-manifest`, becomes an
   intermediate representation (`dev.dbt-import.schemas.ir`) free of Metabase vocabulary: semantic models with their
   entities, dimensions and measures, and metrics over them. dbt's own defaulting rules are applied here, and what is
   structurally beyond Metabase (a cumulative window, a conversion metric) is reported here.
2. `resolve` (`dev.dbt-import.resolve` and its `columns`, `filters` and `dimensions` parts): every IR metric is bound to
   a Lib query against a metadata provider built from the manifest (`dev.dbt-import.metadata`), with a deterministic
   `entity_id` and its dimension set. SQL in a measure's `expr` or a filter goes through sqlglot
   (`dev.dbt-import.sql`). What cannot be expressed as one Metabase metric is reported here.
3. `emit` (`dev.dbt-import.emit`): each resolved metric becomes a Card row, and the collection a Collection row, that
   serdes' own `extract-one` turns into entities the way an export does with a row from the app DB: the Card and
   Collection specs decide which keys are written, columns at their default value are left out, and the provider's
   ids become names. Only the curated dimensions keep a hand-built shape (see `card-schema` in `emit.clj`).

MBQL is never written or read by hand: queries are built with `metabase.lib.core`, and what the converter needs to know
about them comes from Lib.

## Converting a manifest

### Producing `target/manifest.json`

The converter was developed against https://github.com/flexanalytics/dbt-business-intelligence, a dbt project on the
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

The converter reads manifests written by **dbt 1.12 or later**, on manifest schema v12. It checks `metadata` first
and rejects anything else up front with `Unsupported dbt manifest`, naming the `dbt_version` and `dbt_schema_version`
it found. dbt 1.12 is the release the converter is written and tested against: the one that introduced the inline
(`models:`-nested) spec, with `metric_aggregation_params` and `cumulative_type_params.metric`, and the one both
fixtures were generated with. Older releases are not supported: dbt 1.8 to 1.11 also write schema v12, and much of
what the manifest schemas in `dev.dbt-import.schemas.dbt-manifest` read predates 1.12 (`fill_nulls_with` is from dbt
1.7, `cumulative_type_params` from 1.9), but nothing has checked what those releases write, so they are refused rather
than guessed at. To import an older project, upgrade dbt and run `dbt parse` again; a project on the legacy spec
(top-level `semantic_models:` and `metrics:`) needs no changes for that, dbt 1.12 still parses it.

The schemas require only the keys the converter cannot do without. A key dbt-core writes as `null` when unset may be
left out altogether, as another writer of the manifest (dbt Fusion, a hand-written file) might leave it; the converter
reads a missing key as `null`.

### Running the converter

From a dev REPL (needs the `:ee` alias on the classpath for the serdes YAML writer):

```clojure
(require '[dev.dbt-import.core :as dbt-import])

(dbt-import/convert! {:manifest "/path/to/dbt-business-intelligence/target/manifest.json"
                      :out-dir  "/path/to/serdes-out"
                      :config   {:databases     {"dbt_bi" "Sales DB"}   ; warehouse db name -> Metabase Database name
                                 :driver        :postgres               ; the Metabase driver for those databases
                                 :creator-email "admin@example.com"}})  ; the user the cards are created as
```

A relative `:out-dir` (or `:manifest`) resolves against the JVM's working directory (`user.dir`): the repo root for a
REPL started there.

The config is the closed map `dev.dbt-import.schemas.resolved/config`; a key it does not list is refused:

| Key | Required | Type | Meaning | Default |
| -- | -- | -- | -- | -- |
| `:databases` | yes | map of string to string | The one mapping the manifest cannot supply: the warehouse database as dbt knows it (`node_relation.database` in the manifest) to the name of the Metabase Database it is connected as, letter case included. A semantic model whose database has no entry reports every metric over it. | none |
| `:driver` | yes | keyword | The Metabase driver those databases use, `:postgres`. It has to be one the instance can load and a JDBC driver (one derived from `:sql-jdbc`): `:mongo` or `:bigquery-cloud-sdk` fails the run up front, since the converter types columns through the driver's sql-jdbc type mapping. See below for what the driver decides. | none |
| `:creator-email` | yes | string | The user the cards are created as. Serdes resolves it by email and synthesizes an inactive user when none exists, but a card cannot be imported without one. | none |
| `:collection-name` | no | string | The name of the collection the metrics are written to; also the collection's file and directory name, slugified (`dbt metrics` is `collections/main/dbt_metrics.yaml` and `dbt_metrics/`). A name that slugifies to nothing, `.` or `..` is refused. | `dbt metrics` |
| `:entity-models` | no | map of string to string | Entity name to semantic model name: which semantic model a foreign or unique entity joins to when more than one other semantic model is keyed by that entity, as its primary entity or as a unique one. An entity exactly one model is keyed by needs no entry; an entry naming a model that is not keyed by the entity is reported. | none |

The `:driver` decides three things. Its own `database-type->base-type` mapping turns the project's declared column
types into Metabase base types, so a `data_type` the driver has no mapping for is reported; the fix is a mapping in
the driver, which is meant to have one for every type its warehouse has. It picks the SQL dialect `expr` and `filter`
SQL is parsed in. And its feature flags say which clauses the warehouse can run (a `median` on MySQL cannot), see
"Manifest and configuration errors". It has to agree with the dbt adapter the manifest was written with
(`metadata.adapter_type`, the `type` of the profile `dbt parse` ran with): `convert!` fails up front when the adapter
maps to another driver (`postgres` → `:postgres`, `bigquery` → `:bigquery-cloud-sdk`, `trino` → `:starburst`, `spark`
→ `:sparksql`, …; the table is `dev.dbt-import.adapter/adapter->driver`), and logs a warning and takes the config at
its word when the manifest names no adapter or one with no Metabase driver (`duckdb`).

Reading the manifest can fail before anything else does, and every such failure names the file: one that cannot be
read or is not JSON (`Cannot read dbt manifest ...`), one whose JSON is not an object (`Invalid dbt manifest ...: the
file is empty`, or holds an array), one from a dbt release the converter does not read (`Unsupported dbt manifest`,
see "Supported dbt versions"), and one that is a v12 manifest but not in the shape the converter reads (`Invalid dbt
manifest`, with the schema errors in the exception's data).

The field refs the converter writes carry no type at all, neither a base type nor an effective type: the instance
knows its columns, and a ref's options would override that knowledge once the card is imported, so the ref names the
column and nothing more. (The converter still types columns internally, from the project's `data_type` through the
driver, wherever it has to decide something, and a curated dimension is written with the `effective_type` it worked
out, when it knew one.) A column the project does not document, or documents without a `data_type`, is a column of
unknown type to the converter. A column that does not exist in the warehouse does not fail the import, which makes up
an inactive Field for it and reports success; the card fails when it is run. Run `preflight` before importing to catch
it (see "Importing the result"). The converter trusts what dbt says about a column of unknown type where it has to
decide something: a `type: time` dimension over it is bucketed by the grain as written (a typed column takes only the
grains Metabase allows its type, so a date has no `hour`), a bare column in a boolean position is taken for a boolean,
a `sum_boolean` over it counts it as one, and a division by it is not taken for integer division.

### The report

`convert!` returns a map:

- `:out-dir`, the directory written to;
- `:converted`, one entry per metric written: `{:name :entity-id :path :notes :unsupported-dimensions}`, the dbt
  metric name, the card's `entity_id`, the YAML file relative to `:out-dir`, the metric's notes, and the metric's dbt
  dimensions that could not become curated dimensions, each `{:name :reason}`. A note is a string saying where the
  metric agrees with dbt only under some conditions; there are two, read off the finished query so that every way of
  writing the case is caught: a cumulative metric is a running total across whatever it is broken out by, so it is
  right only with its `agg_time_dimension` as the finest breakout (see "Limitations"), and a metric that buckets
  anything by week, in a filter, a `.grain('week')` or a `date_trunc('week', ...)`, starts its weeks on the
  instance's first day of the week where dbt starts them on Monday (see the week caveat under "Filters and SQL
  expressions");
- `:unsupported`, one `{:name :reason}` per metric that could not be converted. "Limitations" below collects every
  reason;
- `:errors`, one `{:name :unique-id :message}` per metric the converter itself failed on: an unexpected exception,
  which is a bug in the converter or an input it did not anticipate, rather than something dbt can say that Metabase
  cannot. The message names the exception: one thrown while resolving the metric is `<class>: <message>`
  (`clojure.lang.ExceptionInfo: ...`); one thrown while parsing it is `error parsing metric (<class>): <message>`,
  and a semantic model that could not be parsed is listed the same way under its own name (`error parsing semantic
  model (<class>): ...`), with every metric over it under `:unsupported` as over a semantic model that was not found.

Nothing is silently dropped, and one bad metric does not stop the run: an unexpected exception while parsing or
resolving a metric is logged with its stack and listed under `:errors`. A ratio or derived metric over a metric that
was reported, or errored, is reported too, with that metric's reason (`metric "x" was not converted: ...`), whichever
stage reported it; one over a metric that refers to itself is reported the same way, with the cycle's reason.

The files are written to a staging directory under `:out-dir` first and swapped into place only once all of them are
written, so a failure part-way (the exception carries the paths written so far and the one that failed) leaves the
previous run's files as they were. A run in which no metric converted writes nothing and leaves `:out-dir` alone, and
says so in the log; its report has an empty `:converted`. What a re-run replaces, and what it leaves alone, is under
"Identifiers and re-import".

### Importing the result

The output is a serdes tree, `collections/main/<collection-slug>.yaml` plus one card per metric under
`collections/main/<collection-slug>/` (the slug of the `:collection-name`, `dbt_metrics` by default; a card's file is
the slug of its label), in the same format `export` produces. Import it into an instance with the serdes command line:

```sh
MB_DB_CONNECTION_URI=... clojure -M:run:ee import /path/to/serdes-out -e
```

`-e` is `--continue-on-error`: the import goes on past an entity it cannot load. Drop it to stop at the first error
instead.

A field ref that does not bind is not such an error. The import never fails on a Database, Table or Field name it
cannot resolve: it makes up a stub Database (no connection details), an inactive Table or an inactive Field for the
name, reports success, and the card fails when it is run. The converter cannot know how the instance names things
(Postgres keeps `public.fact_sales` as dbt wrote it, H2 upper-cases it, a warehouse without schemas syncs the table
with no schema), so check the tree before importing it, from a REPL started against the same app DB the import
command will be given (`MB_DB_CONNECTION_URI`):

```clojure
(dev.dbt-import.core/preflight {:out-dir "/path/to/serdes-out"})
```

It resolves every reference the way the import does, writing nothing, and returns the cards whose references the
import would make up, each with the reference as the YAML writes it and what is there instead, when a near miss
explains it (the same name in another letter case or another schema, or a table or field that exists but is inactive:
a stub a previous import created, or one a sync no longer finds). Import when it returns `[]`. The configuration of
identifier case and of a nil schema is not decided yet; until it is, the check reports the mismatch and the fix is
on the instance's side or the manifest's.

Then open each metric in the UI, run it, and compare the number against a hand-written SQL query. The end-to-end test
under "Fixtures and tests" does the same thing against a test instance.

### Identifiers and re-import

Every id in the tree is derived from the dbt project, never generated, so a re-run writes the same ids and a
re-import updates what the first import created instead of duplicating it. The derivations live in
`dev.dbt-import.ids`; what each id is hashed from:

| Id | Hashed from | How |
| -- | -- | -- |
| a metric card's `entity_id` | `dbt-import/metric/` + the name of the Metabase Database the metric's semantic model is mapped to (its `:databases` value) + `/` + the dbt metric's `unique_id` (`metric.<project>.<name>`) | the first 60 bits of the string's SHA-256 hash seed Metabase's NanoID generator (`metabase.util/generate-nano-id`) |
| the collection's `entity_id` | `dbt-import/collection/` + the names of the Metabase Databases the run writes cards for (the `:databases` values the manifest's semantic models map to), sorted and joined with commas + `/` + the manifest's `metadata.project_name` | the same |
| a curated dimension's id | `dbt-import/dimension/` + the metric's `unique_id` + `/` + the dimension's dbt path (`<entity>__<dimension>`, or the bare name for the metric's own model) | a name-based (version 3) UUID |
| a dimension group's id | the group's type (`main` or `connection`) + `/` + its name, the semantic model's `label` or its table name | the same, which is how Metabase derives a group's id from its display name |

The consequences, for better and worse:

- dbt builds a metric's `unique_id` from its `name`, so a metric renamed in dbt is a new card on import, and the old
  card stays in the instance (import never deletes); a new `label` or `description` keeps the card and updates it.
- Importing again, after a re-run, overwrites the imported cards with what the converter emits: a metric's curated
  dimensions, display name and description edited in the UI since the last import go back to what dbt says, and the
  collection, if it was moved under another one, goes back to the root. Curate in dbt, or import once.
- The ids carry the Metabase Database. One project converted for two Metabase databases (a `dev` and a `prod`
  warehouse, say, each connected as its own Database) is two sets of cards in two collections, each re-importable on
  its own; two dbt projects with the same `project_name` collide only when they are also mapped to the same Database.
  The other side of that: renaming a Metabase Database (or changing what a warehouse database maps to in `:databases`)
  re-keys every card and the collection, so the next import creates a second set of cards next to the first instead
  of updating it. Rename before the first import, or delete the first set by hand.
- A re-run replaces what the previous run wrote for the collection (`collections/main/<collection-slug>.yaml` and
  `collections/main/<collection-slug>/`, see `:collection-name` under "Running the converter"), so a metric renamed
  or removed from the project since then does not survive as a stale file in the tree: a stale card file would come
  back as a card. Anything else under `:out-dir` is left alone, which includes the tree of a previous run with another
  `:collection-name`: its cards carry the same `entity_id`s as the new run's, so importing a directory holding both
  would load each metric twice, the second time over the first. Change the name and the old tree has to go by hand.

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
MetricFlow references around SQL. Both go through sqlglot (`metabase.sql-parsing.core/parse-expression`, used by
`dev.dbt-import.sql`), which parses an expression on its own in the dialect of the config's `:driver`, and a subset
of SQL maps onto MBQL:

- column references, literals (numbers, strings, `TRUE` and `FALSE`, and `NULL` as a value, as in `nullif(x, NULL)`),
  unary minus, `+ - * /` and `^`, comparisons, `AND`/`OR`/`NOT`, `IN` and `NOT IN` over a list of values, `BETWEEN`
  and `NOT BETWEEN`. A negation leaves the null rows out, as SQL does: `!=` is `[:not [:= ...]]` and `NOT IN` is
  `[:not [:in ...]]`, never Lib's `!=` and `not-in`, which Metabase compiles to `x <> v OR x IS NULL`, and a negated
  `LIKE` or regex match (below) is conjoined with `IS NOT NULL`. A comparison, `IN`, `BETWEEN` or simple `CASE x WHEN`
  with a `NULL` literal as an operand is reported: in SQL it is null, so never true, while the `[:= x nil]` it would
  become is a null check that matches the null rows. A `/` of two
  known integers is reported on the warehouses that truncate the quotient (Postgres, SQL Server, Redshift,
  Presto/Trino, SQLite), since Metabase's `/` does not; a bare column as a condition (`WHERE is_returned`) is
  `column = true`, and is reported when the project types the column as anything but boolean (see "Limitations" for
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
  converter does not know, a pattern with a backslash is reported. A `%x%`, `x%`, `%x` or `x%y` pattern, or
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
  it, so those are reported (see "Limitations");
- the functions with an MBQL expression function of the same meaning: `coalesce`, `nullif` (as the `CASE` it stands
  for; `x / NULLIF(y, 0)` is plain division, since Metabase's `/` already returns NULL for a zero divisor), `abs`,
  `floor`, `ceil`/`ceiling`, `round` (to a literal number of decimals, at most 18, as `round(x * 10^n) / 10^n`),
  `sqrt`, `exp`, `log` (base 10, as in Metabase; `ln` does not map), `power`, `lower`, `upper`,
  `trim`/`ltrim`/`rtrim` (of spaces), `length`/`char_length`, `replace`, `substring`/`substr`, `concat` and `||`,
  `extract`/`date_part` of `year`, `quarter`, `month`, `day`, `hour`, `minute` or `second`,
  `now()`/`current_timestamp`, `current_date`, and `date_trunc` over a column to a Metabase temporal unit
  (`millisecond` through `year`, the same units a grain on a reference takes), which is the column bucketed by that
  unit.

Anything outside that subset is reported, naming the construct; see "Limitations".

A caveat on weeks: dbt's `week` grain, and `date_trunc('week', ...)` on most warehouses, is the ISO week, which starts
on Monday. A Metabase `week` starts on the day the instance's "First day of the week" setting names (Sunday by
default), so a metric filtered or broken out by week agrees with dbt only on an instance set to Monday. The converter
reads `week` as the Metabase unit, wherever it is written (a `TimeDimension` grain, a `.grain('week')`, a
`date_trunc('week', ...)` in a filter or in a measure's `expr`), and puts a note on the metric in the report's
`:converted` entry saying so (see "The report"); `extract(dow ...)` and `extract(week ...)` are reported for the same
reason.

In a filter, `Dimension('<entity>__<dimension>')` (or `Dimension('<dimension>')`, with no entity) resolves to the
dimension's `expr` on the metric's own semantic model when the entity is the model's primary entity: its column, or,
for a dimension whose `expr` is SQL, that expression converted and inlined, so a SQL dimension can be filtered on even
though it cannot be a curated dimension. `TimeDimension(..., '<grain>')`, or equivalently
`Dimension(...).grain('<grain>')`, additionally buckets the column by the matching Metabase temporal unit; a SQL
dimension cannot be bucketed and is reported there. `metric_time` is the measure's `agg_time_dimension` and
`Entity('<name>')` is that entity's `expr`, column or SQL. A dimension reached through a foreign or unique entity is on
the semantic model keyed by that entity (its primary or a unique entity, see "Entities and dimensions"), and resolves
to that model's column joined implicitly through the entity's column; a join that cannot be made reports the metric,
since the filter cannot be written. The SQL around the references is parsed with the identifiers left in it standing
for the references, and a bare identifier that is not a reference (`status = 'x'` next to a `{{ Dimension(...) }}`) is
read as a column of the metric's own semantic model, by name, with no check that the project documents it: an
undocumented name becomes a column of unknown type, as it would in a measure's `expr`, and only `preflight` or the
running card finds out. A template with no reference at all is reported. `Metric(...)` references are reported (see
"Limitations"), and so is a reference with any argument beyond its name and grain, such as
`Dimension('customer__region', entity_path=['order'])`: the converter reaches a dimension through the entity named in
the reference and cannot follow another path. Any other method chained onto a reference (`.date_part('month')`) is
reported too, and so is Jinja that is not one of those four references (`{{ var('x') }}`, `{% if %}`, `{# #}`), inside
a string literal included, as Jinja the converter could not parse.

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
| `sum_boolean` of a column the project types as anything but boolean | `agg: sum_boolean`, `expr: is_returned` where the model documents `is_returned` as `integer` | `sum_boolean` counts the rows where the column is true, which the converter writes as `count-where` the column; a column that is not boolean is not a condition, and summing it as one would be a guess at the project's encoding (`1`/`0`, `'Y'`/`'N'`). A column the project does not type is taken at dbt's word, and the warehouse rejects the comparison when the card runs if it is not boolean. | Nothing in Metabase: write the measure's `expr` as the condition (`is_returned = 1`), which converts. |

One flag is accepted and ignored rather than reported: `use_approximate_percentile: true` (inline spec
`percentile_type: continuous`, which dbt writes as this flag) asks the warehouse for an approximate percentile where it
has one (`approx_percentile`, `percentile_approx`). Metabase has one `percentile` (and `median`), which each driver
compiles to what its warehouse has: exact (`percentile_cont`) on Postgres, Redshift, Snowflake, Oracle and SQL Server,
approximate on BigQuery (`APPROX_QUANTILES`), Presto/Trino, Athena and Starburst (`approx_percentile`). So the flag
changes nothing, and the number can differ from dbt's where dbt and Metabase pick differently for the same warehouse;
the import reports nothing about it. A driver with no percentile at all (MySQL, SQLite, H2, Vertica) is caught: a
`median` or `percentile` metric for it is reported, see "Manifest and configuration errors".

### SQL in `expr` and `filter`

A measure's `expr` and a `filter` are parsed with sqlglot and mapped onto MBQL clause by clause. The subset that maps is
listed under "Filters and SQL expressions"; everything outside it is reported, naming the construct:

| dbt | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| a function with no MBQL expression function of the same meaning | `greatest(a, b)`, `regexp_replace(x, 'a', 'b')`, `to_char(d, 'YYYY')`, `ln(x)`, `log(2, x)`, `dateadd(day, 1, d)`, `extract(dow from d)`, `trim('x' from s)`, `round(x, -1)`, `round(x, 19)`, `date_trunc('decade', d)`, `date_trunc('month', d + 1)` | The functions that have an MBQL expression function with the same meaning are mapped (the list is under "Filters and SQL expressions"); the rest have nothing to map onto. `round` to a number of decimals is `round(x * 10^n) / 10^n`, so the decimals have to be a literal. `date_trunc` is a temporal bucket on a column ref, so there is nothing to bucket when its argument is an expression, and nothing for a unit Metabase does not have. | Extend the converter where MBQL has an equivalent under another shape (`dateadd` as `datetime-add`, `greatest` as a `case`); extend MBQL with the rest (a regex replace, a date format, a natural log, week and day-of-week extraction that agrees on the first day of the week). |
| a `CAST` to anything but an integer, decimal, float, text, date or timestamp type | `cast(x as boolean)`, `x::uuid`, `cast(x as interval)` | MBQL's conversions are `integer`, `float`, `text`, `date` and `datetime`, and the common SQL spellings of those types map onto them (`cast(amount_cents as decimal) / 100` converts on Postgres). | Extend MBQL with the missing conversions. |
| a `CAST` to a decimal with a scale, or to a bare `DECIMAL` where that is a scale-0 type | `cast(x as numeric(10, 2))`, `x::decimal(12)`, `cast(x as decimal)` on MySQL, SQL Server, Oracle, Redshift, Snowflake, Spark/Databricks or Trino | The warehouse rounds the value to the scale (`DECIMAL(10, 2)` to two decimals, a bare `DECIMAL` to none everywhere but Postgres, where it is unconstrained, BigQuery, where `NUMERIC` has nine, and SQLite, which has no fixed point), and MBQL's `float` conversion keeps every digit, so the number would silently differ. | Extend MBQL with a conversion to a decimal of a given scale, or convert `DECIMAL(p, s)` as `round(x * 10^s) / 10^s` where the warehouse's rounding mode is known. |
| a `CAST` to an integer where the warehouse truncates and Metabase rounds | `cast(x as int)` of a non-integer value on Spark/Databricks, SQLite, ClickHouse or Redshift (whose `enable_numeric_rounding` is off by default) | Those warehouses drop the fraction, where Metabase compiles its `integer` conversion there as `CAST(ROUND(x) AS BIGINT)`, so `2.7` is `2` to dbt and `3` to Metabase. A value already known to be an integer converts. | Write `floor(x)` in the project, or extend MBQL's `integer` conversion with a rounding mode. |
| a comparison, `IN`, `BETWEEN` or simple `CASE x WHEN` with a `NULL` literal as an operand | `{{ Dimension('order__status') }} = NULL`, `status IN ('a', NULL)`, `case status when null then 1 end` | In SQL the comparison is null, so never true. Lib reads a nil operand of `=`, `!=` or `in` as a null check, so `[:= x nil]` would match the null rows, the opposite of what was written. | Nothing: `IS [NOT] NULL` converts. |
| an integer divided by an integer, on a warehouse that truncates the quotient | `expr: quantity / 2`, `expr: amount_cents / 100` with an integer column, on Postgres, SQL Server, Redshift, Presto/Trino or SQLite | There `7 / 2` is `3`; Metabase's `/` divides as floats and gives `3.5`, so the number would silently differ. Both operands have to be known integers (a column the project does not type is not), and the warehouse has to be one that truncates: sqlglot knows which do, and MySQL, Snowflake, BigQuery, Oracle and Databricks divide as decimals, as Metabase does, so the same `expr` converts there. The inputs of a derived metric are `[:metric ...]` references of no known type, so `a / b` over two counts is not caught. | Cast an operand in the project (`quantity / 2.0`, `cast(amount_cents as decimal) / 100` converts); or extend MBQL with an integer division. |
| a non-boolean column standing alone as a condition | `filter: "{{ Dimension('order__status') }}"`, `expr: case when status then 1 end` | A bare column in a boolean position is read as `column = true`, which is right for a boolean column (`WHERE is_returned`) and nothing else: the warehouse rejects an integer or text there, where `[:= x true]` would run and match nothing. A column the project types as anything but boolean is reported; one it does not type is trusted. | Nothing: this is a mistake in the project. |
| a `LIKE`, `SIMILAR TO` or regex pattern that is not a string literal | `like {{ Dimension('order__prefix') }} \|\| '%'`, `~ {{ Dimension('order__pattern') }}` | A pattern that is a column or an expression cannot be taken apart into Lib's string filters, and the regex fallback needs the regex as a literal too. | Extend MBQL with a `like` clause taking an expression as the pattern. |
| a `LIKE` pattern with a backslash and no `ESCAPE`, on a dialect whose default escape character the converter does not know | `like '100\%'` on Druid, or with no `:driver` dialect | The pattern means `100%` where a backslash is the default escape character and `100\` followed by anything where it is not. The converter knows the answer for Postgres, Redshift, MySQL, BigQuery, Spark/Databricks, Hive and ClickHouse (a backslash) and for Snowflake, SQL Server, Oracle, SQLite and Trino/Presto (none); elsewhere it reports rather than guess. A `[` in a SQL Server pattern, which opens a character class, is reported too. | Write `ESCAPE` in the project, or add the dialect to the converter's table. |
| a custom calendar granularity | `TimeDimension('order__ordered_at', 'retail_month')`, defined on the project's time spine | Metabase buckets by its standard truncation units, `millisecond` through `year`. `fiscal_quarter` is read as `quarter` until custom calendars are supported. | Custom calendars in Metabase, then a mapping from a dbt custom granularity onto one. |
| a dimension reached through two entities | `Dimension('order__customer__region')` | A dimension mapping is one implicit join, a foreign key on the metric's table to the joined table's key. A two-hop path has no representation. | Extend Metabase metrics so a dimension mapping can carry a multi-hop join path, or so a metric query can hold explicit joins. |
| an `entity_path` argument on a reference | `Dimension('customer__region', entity_path=['order'])` | The converter reaches a dimension through the entity named in the reference, as the one implicit join above. A path through other entities is the same multi-hop join, and the argument is reported rather than dropped so that the filter is not resolved against the wrong entity. | The same multi-hop join path as above. |
| a method other than `.grain()` chained onto a reference | `Dimension('metric_time').date_part('month')`, `Dimension('order__status').descending(True)` | `.grain('month')` is read and means what `TimeDimension('...', 'month')` does. `.date_part()` extracts a part of a date (dbt's `dow` and `doy` depend on the first day of the week, see the week caveat under "Filters and SQL expressions"), and the rest are ordering hints that mean nothing in a filter; all are reported, naming the call, rather than dropped. | Map `.date_part('year'|'quarter'|'month'|'day')` onto `get-year` and friends; `dow`/`doy` need the week-start agreement below. |
| Jinja other than a MetricFlow reference | `{{ var('status_col') }} = 'x'`, `{{ Dimension(some_macro()) }}`, `status = '{{ var("x") }}'`, `{% if ... %}` | Only `Dimension(...)`, `TimeDimension(...)`, `Entity(...)` and `Metric(...)` with quoted names are read. Anything else, a `{{`, `{%` or `{#` anywhere in the template, inside a string literal included, is reported as Jinja the converter could not parse. | Render the filter with dbt (`dbt compile`) before importing, or evaluate the manifest's `var`s in the converter. |

One construct converts with a difference in what it returns for nulls. `a || b` in a measure's `expr` or a `filter`
becomes Metabase's `concat`, which the SQL drivers (SQLite's aside) compile to the warehouse's `CONCAT()` function. On
Postgres, `CONCAT()` treats a null argument as an empty string where `||` yields null, so `count_distinct(status ||
code)` counts a row whose `code` is null, under its `status` alone, where dbt's `count(distinct ...)` skips the null
`||` gives it; a filter on `a || b` can likewise match rows the SQL would not. On warehouses whose `CONCAT()`
propagates nulls as `||` does, Redshift, Snowflake, BigQuery and Databricks among them, the two agree. The fix belongs
in Metabase: a `:concat` option that compiles to null-propagating concatenation; until then the converter keeps
`concat`.

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
| a ratio or derived metric `time_granularity` whose inputs disagree on an `agg_time_dimension` | `type: derived`, `time_granularity: month`, over `sales` (measure `agg_time_dimension: order_date`) and `target` (measure `agg_time_dimension: target_date`) | The metric's grain becomes the default temporal unit of its default dimension, the inputs' shared `agg_time_dimension`. When the inputs disagree there is no default dimension to carry it, so the grain is reported under dbt's name for the dimension it buckets, `metric_time`; the metric and its dimensions convert at their own grains. | Metabase cannot hold a breakout to a grain; the converter would have to pick one input's time dimension, which is not what dbt means. |

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
- A `:driver` that is not a JDBC driver (`:mongo`, `:bigquery-cloud-sdk`): the converter types columns through the
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
- An exception the converter did not anticipate while parsing or resolving one metric (or parsing one semantic
  model): a bug, or an input outside what it reads. It is logged with its stack and listed under the report's
  `:errors`, apart from the `:unsupported` metrics, which are the cases the converter chose not to convert.
- A foreign or unique entity that more than one other semantic model is keyed by (`customer` declared `type: primary`
  on both `dim_customer` and `dim_customer_history`, or `primary` on one and `unique` on the other) with no entry in
  the config's `:entity-models` naming the model it joins to, or an entry naming a model that is not keyed by it. An
  entity no other model is keyed by is just a key and reports nothing.
- A metric `time_granularity` Metabase has no temporal unit for (a custom calendar grain, or `hour` on a date
  column); see "Entities and dimensions".
- A `percentile` outside 0 and 1. dbt takes the percentile as a fraction (`0.95`) and nothing else, and so does the
  converter: `95` is reported rather than read as 95%, since `1.5` could not be and the two readings would have to
  meet somewhere.

## Fixtures and tests

### The test fixtures

Two manifests under `dev/resources/dbt_import/`, one per way of writing a dbt semantic layer, both trimmed to the
sections the converter reads and both written by `dbt parse` under dbt 1.12.6 (manifest schema v12). That is the only
kind of manifest the converter accepts, see "Supported dbt versions".

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
hand-built manifests in `dev/test/dev/dbt_import/advanced_metrics_test.clj` only. `sales_to_target_ratio_2` is the
correct ratio form of the project's `sales_to_target`, which averages a per-row `sales / target`; both are kept. To
run the extra metrics in a dev instance, paste them into the clone's `semantic_models.yml` under `metrics:` and
`dbt parse` it the same way.

`parcel_delivery_manifest.json` is the manifest of the small project checked in under `parcel_delivery/`, on the
**dbt 1.12 inline spec**, see the next section. It is the shape of four redacted models from a customer's project,
renamed onto a parcel-delivery domain with the BigQuery types turned into Postgres ones: four semantic models, nineteen
metrics covering every aggregation the inline spec allows except `sum_boolean`, `median` and `min`/`max`, a ratio, a
derived metric, two cumulative metrics (both over a `count_distinct`, so both are reported), filters, a SQL `expr`,
and `derived_semantics` SQL dimensions. `dev/test/dev/dbt_import/inline_spec_test.clj` pins down what the parser makes
of it and what the pipeline converts.

Regenerate a fixture after changing its project (or the clone, or the extra metrics), from a REPL at the repo root:

```clojure
(dev.dbt-import.fixture/regenerate! :parcel-delivery)
(dev.dbt-import.fixture/regenerate! :flexanalytics)   ; the clone at ~/dbt-business-intelligence
(dev.dbt-import.fixture/regenerate! :flexanalytics {:project "/path/to/dbt-business-intelligence"})
```

`dev.dbt-import.fixture/regenerate!` checks that the REPL runs at the repo root, copies the project to a scratch
directory (a git checkout's tracked and untracked files, or a plain directory's) with a `profiles.yml` of its own, so
that `dbt parse` has the adapter and the warehouse database name it needs (it never connects, and the project itself
is never modified), splices the extra metrics in for flexanalytics, and runs `dbt parse` through `uvx` with `dbt-core`
pinned to the release `dev.dbt-import.fixture/dbt-version` names (1.12.6) and `dbt-postgres` to
`dev.dbt-import.fixture/dbt-postgres-version` (1.11.0; its transitive dependencies are not pinned), or as whatever
`dbt` is on `PATH` when there is no `uvx`; a manifest another release wrote is refused, since the fixtures and the
tests that pin what is in them would drift with it. It writes the trimmed result the way Python's
`json.dumps(indent=1)` would, with keys in dbt's order, so a regeneration's diff is only what changed, plus dbt's
`created_at` and `generated_at` timestamps. `dev.dbt-import.marts/regenerate!`, below, reuses the same scratch copy to
build the project.

dbt runs the project's code (its macros and hooks), so only regenerate from a checkout you have reviewed. Two
safeguards narrow what that code can get at:

- dbt and `uvx` get a trimmed environment, not yours: `PATH`, `HOME`, `USER`, `LOGNAME`, `LANG`, `LC_*`, `TMPDIR`,
  `TMP`, `TEMP`, `UV_*`, `XDG_*`, the `*_proxy` variables and `SSL_CERT_FILE`/`SSL_CERT_DIR` (see
  `dev.dbt-import.fixture/dbt-env`), plus `DBT_PROFILES_DIR` pointing at the scratch profile. Your own `DBT_*`
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
parse any metric; `parcel_delivery/models/time_spine.sql` is the smallest one that satisfies it, and the converter
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

The tests live under `dev/test/dev/dbt_import/`, which the `:dev/test` alias adds to the classpath (`:dev` alone does
not). Start a REPL that can run them with the `:ee` alias too, since `emit` needs serdes' YAML writer:

```sh
clojure -M:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:nrepl
```

From a REPL started without `:dev/test`, load the files by path instead of requiring them:

```clojure
(load-file "dev/test/dev/dbt_import/test_util.clj")
(load-file "dev/test/dev/dbt_import/parse_test.clj")
(clojure.test/run-tests 'dev.dbt-import.parse-test)
```

For a fresh-JVM run of every test except the end-to-end one:

```sh
./bin/mage project-tests dbt-import
```

which runs these thirteen namespaces (`./bin/test-agent :only '[dev.dbt-import.parse-test]'` runs one; `test-agent`
uses `:dev/test` itself):

```sh
./bin/test-agent :only '[dev.dbt-import.parse-test dev.dbt-import.inline-spec-test dev.dbt-import.resolve-test dev.dbt-import.advanced-metrics-test dev.dbt-import.dimensions-test dev.dbt-import.emit-test dev.dbt-import.core-test dev.dbt-import.fixture-test dev.dbt-import.marts-test dev.dbt-import.sql-test dev.dbt-import.adapter-test dev.dbt-import.preflight-test dev.dbt-import.generative-test]'
```

CI runs the same namespaces as part of `./bin/mage project-tests backend` (the "Project tests: Suites" job in
`.github/workflows/backend.yml`), triggered by any change under `dev/`, `dev/resources/dbt_import/` or `deps.edn`.
`dev.dbt-import.e2e-test` is not in that suite: it needs a Postgres warehouse (`MB_POSTGRESQL_TEST_*`) and passes with
no assertions without one, so run it by hand as described under "The end-to-end test".

`core-test` runs the whole pipeline on the fixtures and pins the report's shape; `sql-test` tests the SQL converter on
its own, down to the H2 SQL the converted conditions compile to; `adapter-test` covers the adapter check and
`preflight-test` the pre-import check against an app DB; `generative-test` runs manifests generated from the
manifest schemas through parse and resolve, checking that nothing escapes as an exception; `fixture-test` and
`marts-test` cover the parts of the two generators that need neither dbt nor Postgres (what gets copied, what the
manifest is trimmed to, the environment dbt gets, how the password is kept off the screen and out of the JDBC URL).

All but the end-to-end test need no warehouse: they run the fixtures and small hand-built manifests through the
pipeline and compare the clauses that come out.

### The end-to-end test

`dev/test/dev/dbt_import/e2e_test.clj` is the import described under "Importing the result" as a test: it loads the
project's mart tables into a Postgres test dataset, converts the fixture manifest for that database, imports the YAML
with serdes, and checks that every converted metric returns the number a hand-written SQL query does, that the
curated dimensions break a metric out through their implicit joins, that the cards came through with result metadata,
and that importing a second time updates the cards instead of duplicating them. It runs on Postgres only: the manifest
names its tables `public.fact_sales` and so on, serdes binds a field ref by exact name, and a Postgres test dataset is
called exactly that, where H2 would upper-case it. Run it by name with the Postgres driver enabled:

```sh
./bin/test-agent --drivers=postgres :only '[dev.dbt-import.e2e-test]'
```

The dataset is `dev/resources/dbt_import/flexanalytics_marts.edn`, the four mart tables the semantic models are defined
on (`fact_sales`, `dim_customer`, `dim_product`, `dim_order`; `dim_date` has no semantic model), in the format of
`test/metabase/test/data/dataset_definitions/*.edn`, with dbt's surrogate keys as primary and foreign keys so a sync
knows the joins. Regenerate it after the checkout changes, from a REPL at the repo root with a Postgres to build the
project in (the connection defaults to the test suite's `MB_POSTGRESQL_TEST_*` settings; the database `dbt_bi` has
to exist). The password is a separate argument, not a key of `:connection`, so that a typo in the options cannot put
it on the screen (a failed schema check reports the value it was given):

```clojure
(dev.dbt-import.marts/regenerate!)
(dev.dbt-import.marts/regenerate! {:connection {:port 15432, :user "postgres"}} "password")
```

It builds the project in the same kind of scratch copy `dev.dbt-import.fixture/regenerate!` uses, with the same
trimmed environment and the same stance on `dbt deps` (`{:deps? true}` to allow it), with `dbt seed` and `dbt run`
against that Postgres, and dumps the tables.
