# Extending the import

## Adding a source

The IR is meant to be no one tool's model; the table in [The IR](ir.md) lines dbt's, Cube's and OSI's concepts up with
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
     `unsupported/throw-reason` and caught per entry with `unsupported/catching`, as the dbt source does.
3. Implement `interface/raw->ir` for the source's `:type` with `mu/defmethod` in `<source>.core`, giving the raw
   project (dbt's is a manifest path) and the source's own options (dbt's `:entity-models`) schemas of their own, and
   add the namespace to `core/source-namespaces` so that `convert!` loads it the first time the source is used.
4. Test it with fixtures in its format, as `dbt/`'s tests do. `core_test.clj` runs an IR written by hand, for a
   made-up tool, through the whole import: that is the contract a parser has to meet.

When a format can say something Metabase can express but the IR cannot hold, extend the IR in its own terms (the
schema in `schemas/ir.clj`, then the resolve stage) rather than teaching the shared stages about one source. Every
source can then use it.

## Adding a kind of content

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
