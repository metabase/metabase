# Tests

The tests live under `enterprise/backend/test/metabase_enterprise/semantic_layer_import/`, and the regular backend test
run picks them up. `sql_test.clj` tests the SQL subset on its own, and `core_test.clj` an IR written by hand; the rest
run dbt manifests through the import and live under `dbt/` (see [the dbt README](dbt/README.md#running-the-tests)). Run
them all in a fresh JVM with

```sh
./bin/test-agent :module enterprise/semantic-layer-import
```

or one namespace with `./bin/test-agent :only '[metabase-enterprise.semantic-layer-import.sql-test]'`. From a REPL
started with the `:ee` and `:ee-dev` aliases, require and run them as any other test namespace. The dbt source's
end-to-end test needs a Postgres warehouse; see [its README](dbt/README.md#the-end-to-end-test).
