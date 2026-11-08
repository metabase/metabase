# Importing the result

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
upper-cases declares it the same way, with `driver/database-supports?`), lower-cased otherwise, which is what Postgres,
Redshift and the Trino family do. A driver without the `:schemas` feature (MySQL, SQLite) gets no schema at all.
`:identifier-case` and `:schema-mapping` in [the config](config.md) say otherwise. The Metabase Database's name is the
config's `:databases` value as typed. The import's own column lookup ignores case, so an `expr` still finds the column
it names after folding.

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

Then open each metric in the UI, run it, and compare the number against a hand-written SQL query. [The dbt source's
end-to-end test](dbt/README.md#the-end-to-end-test) does the same thing against a test instance.
