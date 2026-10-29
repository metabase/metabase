# Semantic layer import

`enterprise/semantic-layer-import` turns the metrics defined in a semantic layer into Metabase metrics. A semantic
layer, such as dbt's (MetricFlow), describes a warehouse's tables and the business metrics computed over them. The
import reads such a project and writes each metric as a Metabase metric card: one aggregation over one table, with the
filters the semantic layer defines it with and a curated set of dimensions it can be broken out by. The output is a
serdes tree, the same YAML `export` writes, so an ordinary serdes `import` loads it into an instance. The module itself
writes nothing to the app DB.

Not everything a semantic layer can say has a Metabase equivalent. The import never drops or approximates such a
thing silently: whatever it cannot convert faithfully is listed in a report with the reason, and the rest of the run
goes on.

It is a developer tool, run from a REPL: nothing in Metabase calls it yet, and no premium feature gates it. dbt is the
only source so far; [the dbt source's README](dbt/README.md) covers producing a manifest, running an import of a dbt
project, and how each dbt construct converts or why it does not.

This README has two parts. The first is an overview: how the import is put together, its API, and how to extend it.
The second, from "The IR" on, is reference material for working on the import: the IR in detail, the config, the
report, importing the result, the ids, and the SQL the import understands.

## Architecture

The import is a pipeline. A source-specific front end parses a project into an intermediate representation (IR), and
shared, source-agnostic stages turn the IR into serdes YAML:

```
core/convert!           the one entry point, for every source
 ├─ parse               project files ──► IR, in memory               interface/raw->ir, implemented by dbt.* (a
 │                                                                    nested module of its own) for :dbt
 ├─ check-driver        the config's :driver vs. the IR's warehouse   core
 ├─ resolve             IR ──► Lib queries, dimension sets, report    resolve, resolve.*, metadata, sql, ids
 └─ emit                resolved content ──► serdes YAML tree         emit

core/preflight          YAML tree vs. the target instance's app DB    preflight, db
serdes `import`         YAML tree ──► Cards in the app DB             enterprise/serialization
```

1. **Parse** (source-specific). `convert!` loads the source's namespace the first time it converts something of that
   source's and calls its `interface/raw->ir` method, which reads the project format and produces an
   `::ir/semantic-layer` (`schemas/ir.clj`), handed straight to the next stage without being written anywhere:
   *tables*, each a physical relation with its columns, dimensions, keys and joins, and *metrics*, each simple,
   cumulative, ratio or derived, with filters written as SQL. The source applies its own defaulting rules,
   translates its own idioms into the IR's terms (dbt's entity-based joins, Jinja filter templates and measures, for
   example), and reports what the IR has no place for.
2. **Check the driver.** `check-driver` fails the run when the config's `:driver` is not the driver for the warehouse
   the project was written for, since the driver decides how the project's column types and SQL are read.
3. **Resolve.** Builds an in-memory Lib metadata provider from the IR (`metadata`), with Tables and Fields named the
   way sync would see them in the warehouse. It then builds each metric's query with Lib against that provider: the
   source table, one aggregation and the filters, with SQL translated by `sql` (through sqlglot). Each metric also gets
   its curated dimensions and a deterministic `entity_id`. Ratio and derived metrics refer to the cards of their input
   metrics, so metrics are resolved in dependency order and each one is added to the provider as a card. What cannot
   be a Metabase metric is reported here.
4. **Emit.** Builds a Card row for each resolved metric and a Collection row for the collection they go in, and runs
   them through serdes' own `extract-one`, as an export does, with the id lookups bound to the provider so that ids
   come out as portable references. The YAML is staged and then swapped into place, replacing what the previous run
   wrote.
5. **Check, then import.** `preflight` reads the target instance's app DB to catch references that serdes `import`
   would otherwise stub out silently. The serdes `import` command then loads the tree.

A few principles hold throughout:

- **The IR is the seam.** Everything after the parse stage knows only the IR. A source is a nested module that uses
  this one and implements `interface/raw->ir`; this module never requires a source, and `core` loads one by name, from
  its `source-namespaces`, only when it is used. Adding a source changes nothing in the shared stages, and anything
  added to the IR works for every source.
- **Lib, not hand-written MBQL.** Queries are built with `metabase.lib.core`, what the import needs to know about them
  comes from Lib, and serdes writes them. The output tracks Metabase's query format as it changes.
- **Report, don't fail.** A construct with no Metabase equivalent is thrown deep in a stage with `unsupported/throw!`
  and caught where the stage knows which entry it is about. That entry is reported and the run goes on. An unexpected
  exception is an `:errors` entry, not a failed run. A metric built on a reported metric is reported with that
  metric's reason.
- **Deterministic ids.** Every id is derived from the project (`ids`), so a re-run writes the same ids and a
  re-import updates what the previous import created instead of duplicating it.

## Namespaces

All under `metabase-enterprise.semantic-layer-import`:

| Namespace | Stage | Purpose |
| -- | -- | -- |
| `core` | API | The module's public API: `convert!`, `preflight`, `check-driver` and the report's schema. See "The API". No other module calls it yet, so the module config's `:api` is empty |
| `interface` | parse | `raw->ir`, the multimethod a source implements to parse its project into the IR, and the schemas of what it is handed |
| `schemas.ir` | parse → resolve | The IR: the contract between a source and the shared stages. See "The IR" |
| `schemas.config` | all | The config: what a semantic layer cannot supply (the Metabase Databases, the driver, the cards' creator) and how its content is named and written |
| `schemas.resolved` | resolve → emit | The resolve stage's output: IR content bound to Lib queries |
| `resolve` | resolve | The stage's entry point: builds what all content shares (the env and the collection), resolves each kind of content, and merges in the parse stage's unsupported entries and errors |
| `resolve.metrics` | resolve | Metrics: each IR aggregation as a Lib aggregation, ratio and derived metrics over `[:metric id]` references in dependency order, driver-feature checks, and notes on where a metric agrees with its source only under some conditions |
| `resolve.columns` | resolve | Binds a metric to its table and columns: the run's shared env, the per-metric context, column refs, keys and joins |
| `resolve.filters` | resolve | A metric's IR filters as Lib filter clauses, each placeholder resolved to a dimension, a key or the time dimension |
| `resolve.dimensions` | resolve | A metric's curated dimension set: its table's dimensions, those reached through joins, and its time dimension as the default |
| `sql` | resolve | Warehouse SQL snippets as Lib expressions and filter clauses, parsed by sqlglot; see "SQL in the IR" for the subset. It knows nothing about the IR (a callback resolves columns), so sources use it too |
| `metadata` | resolve | The in-memory Lib metadata provider built from the IR, named as sync would name things, with converted metrics added as cards; also maps its made-up ids back to portable serdes references |
| `ids` | resolve | Every id the import writes, derived by hashing the project's own identifiers. See "Identifiers and re-import" |
| `unsupported` | all | How "no Metabase equivalent" is thrown deep in a stage and turned into a report entry |
| `emit` | emit | Resolved content as serdes entities, through serdes' own extraction, written as a YAML tree |
| `preflight` | after emit | A read-only check of a written tree against the target app DB: the references serdes `import` would stub out |
| `db` | after emit | The app DB queries `preflight` makes |
| `dbt.*` | parse | The dbt source, a nested module of its own (`enterprise/semantic-layer-import.dbt`). See [its README](dbt/README.md) |

## The API

`metabase-enterprise.semantic-layer-import.core` is the module's API. A REPL session running an import or checking a
tree calls it; nothing else in Metabase does yet.

- **`(convert! {:type source, :raw raw, :options options, :out-dir dir, :config config})`** runs the whole import in
  one call: it parses `raw`, the semantic layer as the `source` writes it (for `:dbt`, the path of a `manifest.json`),
  with the source's own `options` (optional; for dbt, `:entity-models`) into the IR, keeps that in memory, checks the
  driver, resolves, emits and writes the serdes tree under `dir`, then returns a `::report`. A problem with one entry
  goes in the report; `convert!` throws only for a problem with the run as a whole, such as an unknown `:type`,
  options the source does not take, a driver that does not match the project's warehouse, or a write that fails
  part-way (the previous run's files are then left as they were). `config` is a `::config/config`; see "Running an
  import" for its keys.
- **`::report`** is what `convert!` returns: `:out-dir`; `:converted`, one `::converted` entry per piece of content
  written, dispatching on `:kind` (only `:metric` today: its name, the card's `entity_id`, the file, its notes and the
  dimensions it could not get); `:unsupported`, one `{:kind :name :reason}` per entry that has no Metabase
  equivalent; and `:errors`, one `{:kind :name :unique-id :message}` per entry the import itself failed on. See "The
  report".
- **`(preflight {:out-dir dir})`** checks the tree under `dir` against the app DB the REPL was started with, which
  has to be the instance the tree will be imported into. It returns the cards whose Database, Table or Field references
  serdes `import` would not bind, each with what is there instead when a near miss explains it. `[]` means it is safe
  to import. See "Importing the result".
- **`(check-driver driver warehouse)`** is the driver check `convert!` runs first, public for sources and tests.

`:type` picks the source, whose namespace `convert!` loads the first time it is used; dbt is the only one so far.
What `:raw` and `:options` hold is the source's own business, and the source checks them. A whole run, from a REPL
started with the `:ee` alias:

```clojure
(require '[metabase-enterprise.semantic-layer-import.core :as semantic-layer-import])

(semantic-layer-import/convert!
 {:type    :dbt
  :raw     "/path/to/project/target/manifest.json"
  :out-dir "/path/to/serdes-out"
  :config  {:databases     {"dbt_bi" "Sales DB"}  ; warehouse database -> Metabase Database
            :driver        :postgres              ; the Metabase driver for those databases
            :creator-email "admin@example.com"}}) ; the user the cards are created as
;; => {:out-dir "/path/to/serdes-out", :converted [...], :unsupported [...], :errors [...]}

;; against the instance the tree will be imported into; import when this is []
(semantic-layer-import/preflight {:out-dir "/path/to/serdes-out"})
```

```sh
MB_DB_CONNECTION_URI=... clojure -M:run:ee import /path/to/serdes-out -e
```

## Extending the import

### Adding a source

The IR is meant to be no one tool's model; the table under "The IR" lines dbt's, Cube's and OSI's concepts up with
it. A new source, such as OSI (Open Semantic Interchange), is a parser behind `interface/raw->ir`, and nothing in the
shared stages changes:

1. Make it a nested module, `enterprise/semantic-layer-import.<source>`, in a directory next to `dbt/`, and run
   `./bin/mage fix-modules-config` to record it. A nested module may use this module's internal namespaces, as dbt's
   does with `schemas.ir`, `schemas.config`, `sql` and `unsupported`.
2. Parse the project into an `::ir/semantic-layer`:
   - `:source`: the `:tool` name prefixes every id the import derives (and names the default collection), so it has to
     be unique among sources and must never change;
   - `:warehouse`: the warehouse the project was written for and the Metabase driver that connects to it, as
     `dbt.adapter` works it out, so that `check-driver` catches a config with the wrong driver;
   - `:tables`: for OSI, one per dataset, with its relation, documented columns, dimensions, keys, and joins (its
     relationships, each through a column of the table to another table);
   - `:metrics`: each a `:simple` or `:cumulative` metric (one aggregation over one table) or a `:ratio` or `:derived`
     one (arithmetic over other metrics), with filters as SQL in which each reference to the semantic layer's own
     objects is a placeholder. A format that defines a metric as a whole SQL expression, such as `SUM(amount)`, has
     to take the aggregate function apart from its argument;
   - `:unsupported`: an entry with a reason for anything of the source's own the IR has no place for, thrown with
     `unsupported/throw!` and caught per entry with `unsupported/catching`, as the dbt source does.
3. Implement `interface/raw->ir` for the source's `:type` with `mu/defmethod` in `<source>.core`, giving the raw
   project (dbt's is a manifest path) and the source's own options (dbt's `:entity-models`) schemas of their own, and
   add the namespace to `core/source-namespaces` so that `convert!` loads it the first time the source is used.
4. Test it with fixtures in its format, as `dbt/`'s tests do. `core_test.clj` runs an IR written by hand, for a
   made-up tool, through the whole import: that is the contract a parser has to meet.

When a format can say something Metabase can express but the IR cannot hold, extend the IR in its own terms (the
schema in `schemas/ir.clj`, then the resolve stage) rather than teaching the shared stages about one source. Every
source can then use it.

### Adding a kind of content

Metrics are the only kind of content an import carries today, but every stage is organized by kind and every report
entry names its `:kind`. Other candidates include Cube's segments as Metabase segments, a dbt semantic model's
measures as Metabase measures, and a dbt model as a Metabase transform. A new kind goes in the same place in each
stage:

| Where | What to add |
| -- | -- |
| `schemas/ir.clj` | A key of its own next to `:metrics` in `::ir/semantic-layer`, with its schema, and a value of `::ir/content-kind` for its report entries |
| each source | Parsing it into that key; a source that has nothing of the kind leaves the key empty |
| `resolve/<kind>.clj` | A resolver next to `resolve/metrics.clj`, called from `resolve/resolve-semantic-layer`, with a key of its own in `::resolved/semantic-layer`. When other content refers to it, as a derived metric refers to its inputs, add it to the metadata provider so Lib can resolve the reference, as `metadata/add-metric!` does for metrics |
| `ids.clj` | An id derivation prefixed `<tool>-import/<kind>/`. Once released, it can't change without migrating what earlier runs wrote |
| `emit.clj` | A function next to `metric-files`, called from `files`, and a branch of `::emit/file` for its files. Build the model's row and let its serdes spec extract it, as metrics do; `./bin/mage fix-modules-config` records the new `:model/...` import |
| `core.clj` | A branch of `::converted` and of `converted` for its report entries |
| `preflight.clj` | A check of whatever warehouse objects its entities name, if they name any |

## The IR

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

A metric's dimension set holds its table's dimensions, those of every table its joins lead to (reached by an implicit
join, the `:source-field` of the field ref), and its time dimension as the default, bucketed by its time grain when it
has one. A dimension whose `expr` is SQL, one that bounds a slowly changing dimension's validity window, and every
dimension behind a join that cannot be made are reported under the metric's `:unsupported-dimensions`. A joined
dimension named like another of the set is named `<join>__<dimension>` instead.

The IR holds metrics, the one kind of content an import carries today; see "Adding a kind of content" for another.

## Running an import

`core/convert!` takes the source's `:type`, its `:raw` project and `:options`, a directory and the config; "The API"
above shows a whole run, and the source's README shows what its own `:raw` and `:options` are.

The config is the closed map `schemas.config/config`; a source's own options are its own, not part of it:

| Key | Required | Type | Meaning | Default |
| -- | -- | -- | -- | -- |
| `:databases` | yes | map of string (or nil) to string | The one mapping a semantic layer cannot supply: the warehouse database as the source names it to the name of the Metabase Database it is connected as, as typed, letter case included. The key is `nil` for a source that names no database. A table whose database has no entry reports every metric over it. | none |
| `:driver` | yes | keyword | The Metabase driver those databases use, `:postgres`. It has to be one the instance can load and a JDBC driver (one derived from `:sql-jdbc`): `:mongo` or `:bigquery-cloud-sdk` fails the run up front, since the import types columns through the driver's sql-jdbc type mapping. | none |
| `:creator-email` | yes | string | The user the cards are created as. Serdes resolves it by email and synthesizes an inactive user when none exists, but a card cannot be imported without one. | none |
| `:collection-name` | no | string | The name of the collection the metrics are written to; also the collection's file and directory name, slugified. A name that slugifies to nothing, `.` or `..` is refused. | `<tool> metrics`, `dbt metrics` for dbt |
| `:identifier-case` | no | `:upper`, `:lower` or `:as-is` | How the warehouse stores a name the project wrote without quotes (see "Importing the result"). Overrides what the driver says. | `:upper` for a driver with the `:upper-case-unquoted-identifiers` feature (Snowflake, Oracle, H2), `:lower` otherwise |
| `:schema-mapping` | no | map of string to string or nil | A schema as the source names it to the schema the instance has the table under, `nil` for none, overriding the default for that schema only. | the schema as the driver stores it; `nil` for a driver without the `:schemas` feature |

The `:driver` decides four things. Its own `database-type->base-type` mapping turns the project's declared column
types into Metabase base types, so a type the driver has no mapping for is reported; the fix is a mapping in the
driver, which is meant to have one for every type its warehouse has. It picks the SQL dialect the IR's SQL is parsed
in. Its `:upper-case-unquoted-identifiers` and `:schemas` features say how the warehouse spells the names the project
wrote (see "Importing the result"). And its feature flags say which clauses the warehouse can run: a metric whose
query needs a feature the driver lacks (a `median` on MySQL, a regex on SQL Server, a cumulative metric on Spark) is
reported, naming the clause and the feature, since it would import and fail when queried.

The driver has to agree with the warehouse the semantic layer was written for: the IR names it, and the Metabase driver
the source maps it to (`::ir/warehouse`). `check-driver` fails the run up front when that driver is another one, and
logs a warning and takes the config at its word when the IR names no warehouse, or one the source knows no driver for.

The field refs the import writes carry no type at all: the instance knows its columns, and a ref's options would
override that knowledge once the card is imported, so the ref names the column and nothing more. (The import still
types columns internally, from the project's declared types through the driver, wherever it has to decide something,
and a curated dimension is written with the `effective_type` it worked out, when it knew one.) A column of unknown
type is trusted where it has to decide something: a time dimension over it is bucketed by the grain as written, and a
bare column in a boolean position is taken for a boolean.

### The report

`convert!` returns a map, every entry of which says what `:kind` of content it is about:

- `:out-dir`, the directory written to;
- `:converted`, one entry per metric written: `{:kind :name :entity-id :path :notes :unsupported-dimensions}`, the
  metric's name, the card's `entity_id`, the YAML file relative to `:out-dir`, the metric's notes, and the dimensions
  that could not become curated dimensions, each `{:name :reason}`. A note says where the metric agrees with the source
  only under some conditions, read off the finished query so that every way of writing the case is caught: a
  cumulative metric is a running total across whatever it is broken out by, so it is right only with its time
  dimension as the finest breakout, and a metric that buckets anything by week starts its weeks on the instance's
  first day of the week (see the week caveat under "SQL in the IR");
- `:unsupported`, one `{:kind :name :reason}` per entry that could not be converted;
- `:errors`, one `{:kind :name :unique-id :message}` per entry the import itself failed on: an unexpected exception,
  which is a bug or an input the import did not anticipate, rather than something the source can say that Metabase
  cannot. The message names the exception. A table the source could not parse is listed with `:kind :table`.

Nothing is silently dropped, and one bad entry does not stop the run: an unexpected exception is logged with its stack
and listed under `:errors`. A ratio or derived metric over a metric that was reported, or errored, is reported too,
with that metric's reason (`metric "x" was not converted: ...`), whichever stage reported it; one over a metric that
refers to itself is reported the same way, with the cycle's reason.

The files are written to a staging directory under `:out-dir` first and swapped into place only once all of them are
written, so a failure part-way (the exception carries the paths written so far and the one that failed) leaves the
previous run's files as they were. A run in which nothing converted writes nothing and leaves `:out-dir` alone, and
says so in the log; its report has an empty `:converted`.

### Importing the result

The output is a serdes tree, `collections/main/<collection-slug>.yaml` plus one card per metric under
`collections/main/<collection-slug>/` (a card's file is the slug of its label), in the same format `export` produces.
Import it into an instance with the serdes command line:

```sh
MB_DB_CONNECTION_URI=... clojure -M:run:ee import /path/to/serdes-out -e
```

`-e` is `--continue-on-error`: the import goes on past an entity it cannot load. Drop it to stop at the first error
instead.

A field ref that does not bind is not such an error. The import never fails on a Database, Table or Field name it
cannot resolve: it makes up a stub Database (no connection details), an inactive Table or an inactive Field for the
name, reports success, and the card fails when it is run. It matches names exactly, letter case and schema included
(a nil schema is not `"main"`), and the YAML has to spell them the way sync saw them, not the way the project did.

The import works that spelling out from the IR and the driver (`metadata.clj`). A part of a relation, or a column, the
project quoted when it built the table reached the warehouse as written, and is written as it is. An unquoted one is
folded the way the driver says its warehouse folds it: upper-cased when the driver has the
`:upper-case-unquoted-identifiers` feature (Snowflake, Oracle and H2 set it; a third-party driver for a warehouse that
upper-cases declares it the same way, with `driver/database-supports?`), lower-cased otherwise, which is what
Postgres, Redshift and the Trino family do. A driver without the `:schemas` feature (MySQL, SQLite) gets no schema at
all. `:identifier-case` and `:schema-mapping` in the config say otherwise. The Metabase Database's name is the config's
`:databases` value as typed. The import's own column lookup ignores case, so an `expr` still finds the column it names
after folding.

The instance can still disagree (a Snowflake account with `QUOTED_IDENTIFIERS_IGNORE_CASE`, a MySQL table created
with a mixed-case name the project writes in another case, a project built into one schema and synced from another),
so check the tree before importing it, from a REPL started against the same app DB the import command will be given
(`MB_DB_CONNECTION_URI`):

```clojure
(metabase-enterprise.semantic-layer-import.core/preflight {:out-dir "/path/to/serdes-out"})
```

It resolves every reference the way the import does, writing nothing, and returns the cards whose references the
import would make up, each with the reference as the YAML writes it and what is there instead, when a near miss
explains it (the same name in another letter case or another schema, or a table or field that exists but is inactive:
a stub a previous import created, or one a sync no longer finds), and names the config key that fixes a near miss
(`:identifier-case` for the letter case, `:schema-mapping` for the schema). Import when it returns `[]`.

Then open each metric in the UI, run it, and compare the number against a hand-written SQL query. The dbt source's
end-to-end test does the same thing against a test instance.

### Identifiers and re-import

Every id in the tree is derived from the project, never generated, so a re-run writes the same ids and a re-import
updates what the first import created instead of duplicating it. The derivations live in `ids.clj`; `<tool>` is the
source's (`dbt`), so two sources never share an id:

| Id | Hashed from | How |
| -- | -- | -- |
| a metric card's `entity_id` | `<tool>-import/metric/` + the name of the Metabase Database the metric's table is mapped to (its `:databases` value) + `/` + the metric's unique id in the source | the first 60 bits of the string's SHA-256 hash seed Metabase's NanoID generator (`metabase.util/generate-nano-id`) |
| the collection's `entity_id` | `<tool>-import/collection/` + the names of the Metabase Databases the run writes cards for, sorted and joined with commas + `/` + the project's name | the same |
| a curated dimension's id | `<tool>-import/dimension/` + the metric's unique id + `/` + the dimension's path (`<join>__<dimension>`, or the bare name on the metric's own table) | a name-based (version 3) UUID |
| a dimension group's id | the group's type (`main` or `connection`) + `/` + its name, the table's label or its relation's name | the same, which is how Metabase derives a group's id from its display name |

The consequences, for better and worse:

- A metric whose unique id changes in the source is a new card on import, and the old card stays in the instance
  (import never deletes); a new label or description keeps the card and updates it.
- Importing again, after a re-run, overwrites the imported cards with what the import emits: a metric's curated
  dimensions, display name and description edited in the UI since the last import go back to what the source says,
  and the collection, if it was moved under another one, goes back to the root. Curate in the source, or import once.
- The ids carry the Metabase Database. One project imported for two Metabase databases (a `dev` and a `prod`
  warehouse, say, each connected as its own Database) is two sets of cards in two collections, each re-importable on
  its own; two projects with the same name collide only when they are also mapped to the same Database. The other side
  of that: renaming a Metabase Database (or changing what a warehouse database maps to in `:databases`) re-keys every
  card and the collection, so the next import creates a second set of cards next to the first instead of updating it.
  Rename before the first import, or delete the first set by hand.
- A re-run replaces what the previous run wrote for the collection (`collections/main/<collection-slug>.yaml` and
  `collections/main/<collection-slug>/`), so a metric renamed or removed since then does not survive as a stale file
  in the tree: a stale card file would come back as a card. Anything else under `:out-dir` is left alone, which
  includes the tree of a previous run with another `:collection-name`: its cards carry the same `entity_id`s as the new
  run's, so importing a directory holding both would load each metric twice, the second time over the first. Change
  the name and the old tree has to go by hand.

## SQL in the IR

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

A caveat on weeks: a semantic layer's `week` grain, and `date_trunc('week', ...)` on most warehouses, is the ISO week,
which starts on Monday. A Metabase `week` starts on the day the instance's "First day of the week" setting names
(Sunday by default), so a metric filtered or broken out by week agrees with the source only on an instance set to
Monday. The import reads `week` as the Metabase unit wherever it is written (a reference's grain, a
`date_trunc('week', ...)` in a filter or in an aggregation's `expr`), and puts a note on the metric in the report's
`:converted` entry saying so (see "The report"); `extract(dow ...)` and `extract(week ...)` are reported for the same
reason.

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

One construct converts with a difference in what it returns for nulls. `a || b` in an aggregation's `expr` or a filter
becomes Metabase's `concat`, which the SQL drivers (SQLite's aside) compile to the warehouse's `CONCAT()` function. On
Postgres, `CONCAT()` treats a null argument as an empty string where `||` yields null, so `count_distinct(status ||
code)` counts a row whose `code` is null, under its `status` alone, where the source's `count(distinct ...)` skips the
null `||` gives it; a filter on `a || b` can likewise match rows the SQL would not. On warehouses whose `CONCAT()`
propagates nulls as `||` does, Redshift, Snowflake, BigQuery and Databricks among them, the two agree. The fix belongs
in Metabase: a `:concat` option that compiles to null-propagating concatenation; until then the import keeps `concat`.

## Tests

The tests live under `enterprise/backend/test/metabase_enterprise/semantic_layer_import/`, and the regular backend test
run picks them up. `sql_test.clj` tests the SQL subset on its own, and `core_test.clj` an IR written by hand; the rest
run dbt manifests through the import and live under `dbt/` (see the dbt README). Run them all in a fresh JVM with

```sh
./bin/test-agent :module enterprise/semantic-layer-import
```

or one namespace with `./bin/test-agent :only '[metabase-enterprise.semantic-layer-import.sql-test]'`. From a REPL
started with the `:ee` and `:ee-dev` aliases, require and run them as any other test namespace. The dbt source's
end-to-end test needs a Postgres warehouse; see its README.
