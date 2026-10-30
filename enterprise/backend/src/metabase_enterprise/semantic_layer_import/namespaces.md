# Namespaces

All under `metabase-enterprise.semantic-layer-import`. The stages are the ones in [the
architecture](README.md#architecture):

| Namespace | Stage | Purpose |
| -- | -- | -- |
| `core` | API | The module's public API: `convert!`, `preflight`, `check-driver` and the report's schema. See [Usage](README.md#usage). No other module calls it yet, so the module config's `:api` is empty |
| `interface` | parse | `raw->ir`, the multimethod a source implements to parse its project into the IR, and the schemas of what it is handed |
| `schemas.ir` | parse → resolve | The IR: the contract between a source and the shared stages. See [The IR](ir.md) |
| `schemas.config` | all | The config: what a semantic layer cannot supply (the Metabase Databases, the driver, the cards' creator) and how its content is named and written |
| `schemas.resolved` | resolve → emit | The resolve stage's output: IR content bound to Lib queries |
| `resolve` | resolve | The stage's entry point: builds what all content shares (the env and the collection), resolves each kind of content, and merges in the parse stage's unsupported entries and errors |
| `resolve.metrics` | resolve | Metrics: each IR aggregation as a Lib aggregation, ratio and derived metrics over `[:metric id]` references in dependency order, driver-feature checks, and notes on where a metric agrees with its source only under some conditions |
| `resolve.columns` | resolve | Binds a metric to its table and columns: the run's shared env, the per-metric context, column refs, keys and joins |
| `resolve.filters` | resolve | A metric's IR filters as Lib filter clauses, each placeholder resolved to a dimension, a key or the time dimension |
| `resolve.dimensions` | resolve | A metric's curated dimension set: its table's dimensions, those reached through joins, and its time dimension as the default |
| `sql` | resolve | The import's side of the SQL in the IR, which the OSS `sql-to-mbql` module converts to Lib expressions and filter clauses: what an `expr` is, Jinja left in the SQL, and the conversion with what it cannot convert as the import's unsupported reasons. See [SQL in the IR](sql.md). Sources use it too |
| `metadata` | resolve | The in-memory Lib metadata provider built from the IR, named as sync would name things, with converted metrics added as cards; also maps its made-up ids back to portable serdes references |
| `ids` | resolve | Every id the import writes, derived by hashing the project's own identifiers. See [Identifiers and re-import](ids.md) |
| `unsupported` | all | How "no Metabase equivalent" is thrown deep in a stage and turned into a report entry |
| `emit` | emit | Resolved content as serdes entities, through serdes' own extraction, written as a YAML tree |
| `preflight` | after emit | A read-only check of a written tree against the target app DB: the references serdes `import` would stub out |
| `db` | after emit | The app DB queries `preflight` makes |
| `dbt.*` | parse | The dbt source, a nested module of its own (`enterprise/semantic-layer-import.dbt`). See [its README](dbt/README.md) |
