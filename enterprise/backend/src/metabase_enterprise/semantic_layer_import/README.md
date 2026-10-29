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
   `::ir/semantic-layer` (`schemas/ir.clj`; see [The IR](ir.md)), handed straight to the next stage without being
   written anywhere: *tables*, each a physical relation with its columns, dimensions, keys and joins, and *metrics*,
   each simple, cumulative, ratio or derived, with filters written as SQL. The source applies its own defaulting rules,
   translates its own idioms into the IR's terms (dbt's entity-based joins, Jinja filter templates and measures, for
   example), and reports what the IR has no place for.
2. **Check the driver.** `check-driver` fails the run when the config's `:driver` is not the driver for the warehouse
   the project was written for, since the driver decides how the project's column types and SQL are read.
3. **Resolve.** Builds an in-memory Lib metadata provider from the IR (`metadata`), with Tables and Fields named the way
   sync would see them in the warehouse. It then builds each metric's query with Lib against that provider: the source
   table, one aggregation and the filters, with SQL translated by `sql` (through sqlglot; see [SQL in the IR](sql.md)).
   Each metric also gets its curated dimensions and a deterministic `entity_id` (see [Identifiers and
   re-import](ids.md)). Ratio and derived metrics refer to the cards of their input metrics, so metrics are resolved in
   dependency order and each one is added to the provider as a card. What cannot be a Metabase metric is reported here,
   in [the report](report.md).
4. **Emit.** Builds a Card row for each resolved metric and a Collection row for the collection they go in, and runs
   them through serdes' own `extract-one`, as an export does, with the id lookups bound to the provider so that ids
   come out as portable references. The YAML is staged and then swapped into place, replacing what the previous run
   wrote.
5. **Check, then import.** `preflight` reads the target instance's app DB to catch references that serdes `import` would
   otherwise stub out silently (see [Importing the result](importing.md)). The serdes `import` command then loads the
   tree.

A few principles hold throughout:

- **The IR is the seam.** Everything after the parse stage knows only the IR. A source is a nested module that uses this
  one and implements `interface/raw->ir`; this module never requires a source, and `core` loads one by name, from its
  `source-namespaces`, only when it is used. [Adding a source](extending.md#adding-a-source) changes nothing in the
  shared stages, and anything added to the IR works for every source.
- **Lib, not hand-written MBQL.** Queries are built with `metabase.lib.core`, what the import needs to know about them
  comes from Lib, and serdes writes them. The output tracks Metabase's query format as it changes.
- **Report, don't fail.** A construct with no Metabase equivalent is thrown deep in a stage with `unsupported/throw!`
  and caught where the stage knows which entry it is about. That entry is reported and the run goes on. An unexpected
  exception is an `:errors` entry, not a failed run. A metric built on a reported metric is reported with that
  metric's reason.
- **Deterministic ids.** Every id is derived from the project (`ids`; see [Identifiers and re-import](ids.md)), so a
  re-run writes the same ids and a re-import updates what the previous import created instead of duplicating it.

## Usage

`metabase-enterprise.semantic-layer-import.core` is the module's API. A REPL session running an import or checking a
tree calls it; nothing else in Metabase does yet.

- **`(convert! {:type source, :raw raw, :options options, :out-dir dir, :config config})`** runs the whole import in one
  call: it parses `raw`, the semantic layer as the `source` writes it (for `:dbt`, the path of a `manifest.json`), with
  the source's own `options` (optional; for dbt, `:entity-models`) into the IR, keeps that in memory, checks the driver,
  resolves, emits and writes the serdes tree under `dir`, then returns a `::report`. A problem with one entry goes in
  the report; `convert!` throws only for a problem with the run as a whole, such as an unknown `:type`, options the
  source does not take, a driver that does not match the project's warehouse, or a write that fails part-way (the
  previous run's files are then left as they were). `config` is a `::config/config`; see [Configuration](config.md) for
  its keys.
- **`::report`** is what `convert!` returns: its `:out-dir`, the content it wrote (`:converted`), what has no Metabase
  equivalent, each with the reason (`:unsupported`), and what the import itself failed on (`:errors`). See
  [The report](report.md).
- **`(preflight {:out-dir dir})`** checks the tree under `dir` against the app DB the REPL was started with, which
  has to be the instance the tree will be imported into. It returns the cards whose Database, Table or Field references
  serdes `import` would not bind, each with what is there instead when a near miss explains it. `[]` means it is safe
  to import. See [Importing the result](importing.md).
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

## Reference

| Document | What it covers |
| -- | -- |
| [Configuration](config.md) | The config's keys, and what the `:driver` decides |
| [The report](report.md) | What `convert!` returns: what converted, what has no Metabase equivalent, what failed, and how a run fails as a whole |
| [Importing the result](importing.md) | Loading the tree with serdes, how the import spells warehouse names the way sync sees them, and checking a tree with `preflight` |
| [Identifiers and re-import](ids.md) | How every id is derived from the project, and what that means for importing again |
| [The IR](ir.md) | The intermediate representation every source parses into: its concepts next to dbt's, Cube's and OSI's, how aggregations map onto Metabase, and how a metric's dimension set is built |
| [SQL in the IR](sql.md) | The subset of warehouse SQL that converts to MBQL, what does not and what it would take, and the caveat on weeks |
| [Namespaces](namespaces.md) | What each namespace does, and which stage it belongs to |
| [Extending the import](extending.md) | Adding a source, and adding a kind of content besides metrics |
| [Tests](tests.md) | Where the tests are and how to run them |
| [The dbt source](dbt/README.md) | Producing a manifest, importing a dbt project, and how each dbt construct converts or why it does not |
