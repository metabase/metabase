# Tests

The tests live under `enterprise/backend/test/metabase_enterprise/semantic_layer_import/`, and the regular backend test
run picks them up. `sql_test.clj` tests the import's side of the SQL (the conversion itself is tested in the
`sql-to-mbql` module's `test/metabase/sql_to_mbql/`), and `core_test.clj` an IR written by hand, an aggregation written
as SQL and a named expression among it; the rest run dbt manifests and Ossie documents through the import and live under
`dbt/` and `ossie/` (see [the dbt README](dbt/README.md#running-the-tests) and [the Ossie
README](ossie/README.md#running-the-tests)). Run them all in a fresh JVM with

```sh
./bin/test-agent :module enterprise/semantic-layer-import
```

or one namespace with `./bin/test-agent :only '[metabase-enterprise.semantic-layer-import.sql-test]'`. From a REPL
started with the `:ee` and `:ee-dev` aliases, require and run them as any other test namespace. Each source's
end-to-end test needs a Postgres warehouse; see [the dbt README](dbt/README.md#the-end-to-end-test) and [the Ossie
README](ossie/README.md#the-end-to-end-test). What the two end-to-end tests share (converting and importing a fixture,
reading the cards back, running a metric and its breakouts, comparing with hand-written SQL) is in
`test_util/e2e.clj`, and what the fixture generators share (the repo-root check and the dataset EDN writer) in
`test_util/regenerate.clj`.
