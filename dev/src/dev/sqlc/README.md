# sqlc -> Clojure codegen spike

Generates Clojure query fns with Malli result schemas from `.sql` files, using
[sqlc](https://sqlc.dev) for SQL parsing and type inference.

## Why sqlc

sqlc resolves `SELECT *` against a catalog and infers expression types (`count(*)` -> `bigint`),
which is the hard part of typing SQL. It reads a schema dump rather than connecting to a live
database, so generation needs no running server. `sqlc-gen-json` is a WASM plugin that emits
sqlc's whole analysis as JSON, so the Clojure side only has to render it.

## Pipeline

    migrated app-db -> pg_dump --schema-only -> sqlc + sqlc-gen-json -> generate_request.json
      -> dev.sqlc.printer -> generated .clj (defn + :malli/schema + docstring)

The schema comes from a *migrated database*, not from the Liquibase YAML: the YAML is a program
(conditional changesets, custom Clojure migrations) and rendering it statically would mean
reimplementing Liquibase. Dumping a migrated instance asks the database what actually exists.

## Verified in this spike

- Migrations ran against Postgres 16: 1427 changesets, 190 tables (67 filtered as DBMS mismatch).
- `pg_dump` output (20,501 lines) fed to sqlc unmodified -- no massaging needed.
- Real queries ported from the glossary/sso HugSQL spike branches resolved correctly:
  `SELECT *` expanded, `citext` on `core_user.email`, nullability right on `first_name`.
- Generated file parses, compiles, and its Malli schemas accept valid rows / reject bad ones.

## Reproduce

    docker run -d --name sqlc-spike-pg -e POSTGRES_PASSWORD=spike -e POSTGRES_USER=spike \
      -e POSTGRES_DB=mbspike -p 55432:5432 postgres:16
    MB_DB_TYPE=postgres MB_DB_HOST=localhost MB_DB_PORT=55432 MB_DB_DBNAME=mbspike \
      MB_DB_USER=spike MB_DB_PASS=spike clojure -M -e "(require '[metabase.app-db.core :as mdb]) (mdb/setup-db! :create-sample-content? false)"
    PGPASSWORD=spike pg_dump -h localhost -p 55432 -U spike -d mbspike --schema-only \
      --no-owner --no-privileges -f schema/schema.sql
    sqlc generate   # with sqlc.yaml in this dir

## Open issues

- **No H2 engine.** sqlc supports postgresql/mysql/sqlite only. H2 types would have to be
  borrowed from the Postgres analysis or read via JDBC introspection against in-process H2.
- **Param type inference is weaker than column inference.** `LIKE $1 ESCAPE '!'` inferred the
  param as `bytea`. Result columns were correct in every case tested; params were not.
  This spike only emits `:any` for params, which sidesteps it.
- **Query names must be Go identifiers.** `-- name: glossary-entry` is rejected; the printer
  kebab-cases `GlossaryEntry` on the way out, so `.sql` files carry CamelCase names.
- **No dynamic SQL.** sqlc has no equivalent of HugSQL's `:value*:ids` expansion. Postgres
  `= ANY($1::int[])` covers the IN-list case and types correctly; other dynamic shapes do not
  translate.
- Schema freshness needs a CI check (regenerate, `git diff --exit-code`).
