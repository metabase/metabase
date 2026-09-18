---
name: app-db-migrations
description: Add, test, run and roll back application-database (Liquibase) migrations. Use when adding a changeset, changing a table or column in the Metabase app DB, writing a custom (Clojure) migration, or rolling migrations back in development.
---

# Application DB migrations

Schema changes to the Metabase application database are Liquibase changesets in YAML under `resources/migrations/`.
Every changeset in the repository is linted by `./bin/lint-migrations-file.sh` (`mage lint-migrations`); run it before
pushing.

## Where a new changeset goes

New changesets are **version-less** and live in a year directory:

```
resources/migrations/2026/20260917_short_snake_case_name.yaml
```

- The directory is the current year; the file name is `<yyyymmdd>_<snake_case_name>.yaml` (lower-case letters,
  digits and underscores only). One file per change or per closely related group of changes; several changesets in
  one file are fine.
- The changeset **id carries no version**: lower-case letters, digits and underscores, with at least one letter, e.g.
  `glossary_entity_id`, `metabot_message_data_version_1`. Not an ISO date or timestamp like the old ids carried
  (`2026-09-18T12:00:00`), not `v66.…`, not all digits, no `v<digit>` prefix. Ids must be unique across the
  repository, so make them specific.
- The Metabase version a changeset ships in is decided by the branch it is merged into, not by anything in the file.
  A backport is the same file with the same id and author on the release branch; Liquibase then recognises it as
  already run when the customer upgrades.

Do **not** add changesets to the versioned files (`migrations/0NN/…` with `vNN.` ids, or `0NN_update_migrations.yaml`).
Those layouts stopped at v65 and the lint refuses `vNN.` ids for 66 and later.

## Writing the changeset

```yaml
databaseChangeLog:
  - changeSet:
      id: glossary_entity_id
      author: yourgithubhandle
      comment: Add entity_id to glossary
      changes:
        - addColumn:
            tableName: glossary
            columns:
              - column:
                  name: entity_id
                  type: varchar(21)
                  remarks: NanoID for serialization
      rollback:
        - dropColumn:
            tableName: glossary
            columnName: entity_id
```

Rules the lint enforces (and reviewers expect):

- **One change per changeset** (several `sql` changes are allowed only when each targets a different `dbms`).
- `comment` is required; `createTable` needs `remarks`, and by convention so does every column.
- Use the portable types: `${boolean.type}`, `${timestamp_type}`, `${text.type}`, `${blob.type}`. Never bare
  `boolean`, `text`, `blob`, `datetime` or `timestamp without time zone`.
- **Rollback**: include a `rollback` key unless the change type supports Liquibase auto-rollback (`createTable`,
  `addColumn`, `createIndex`, `addForeignKeyConstraint`, `renameColumn`, …). `sql`, `dropColumn`, `dropTable`,
  `modifyDataType` and the like need an explicit rollback (an empty `rollback:` is allowed when there is genuinely
  nothing to undo).
- Preconditions that check a constraint or index must be scoped to a table (`indexExists` / `primaryKeyExists` /
  `uniqueConstraintExists` need `tableName`, `foreignKeyConstraintExists` needs `foreignKeyTableName`), or Liquibase
  snapshots the whole schema to answer them.
- No `deleteCascade` on an `addColumn` constraint (add the foreign key with `addForeignKeyConstraint` instead).
- Migrations must work on H2, PostgreSQL and MySQL/MariaDB; anything database-specific gets a `dbms:` filter.
- **Shipped changesets are immutable.** Fix a mistake with a new changeset; never edit or delete one that a release
  contains. `runOnChange: true` changesets (views) are the one exception and may be edited in place.

## Data migrations (Clojure)

Anything that is not plain DDL goes in `src/metabase/app_db/custom_migrations.clj` with
`define-reversible-migration` (or `define-migration` when there is nothing to reverse), referenced from a changeset:

```yaml
      changes:
        - customChange:
            class: metabase.app_db.custom_migrations.MigrateSomething
      rollback:
```

Custom migrations are append-only, must be idempotent and resumable, and must batch their work: never hold a write
lock on a large table for the whole run.

## Testing a migration

Migration tests live in `test/metabase/app_db/schema_migrations_test.clj` and use
`metabase.app-db.schema-migrations-test.impl/test-migrations`: it migrates up to the changeset before yours, lets you
seed data, runs your changeset(s) when you call `migrate!`, and you assert on the result:

```clojure
(deftest glossary-entity-id-test
  (impl/test-migrations ["glossary_entity_id"] [migrate!]
    ;; seed rows, then
    (migrate!)
    (is ...)))
```

See the macro's docstring for asserting on the rollback too. Run them on H2 in a fresh JVM:

```sh
MB_DB_TYPE=h2 ./bin/test-agent :only '[metabase.app-db.schema-migrations-test/glossary-entity-id-test]'
```

## Running and rolling back in development

Every `migrate up` run is recorded as its own Liquibase deployment. Use the dev tooling (in the REPL,
`(dev.migrate/migrate!)` and `(dev.migrate/rollback-last-deployment!)`; or the CLI below — it needs the `:dev` alias):

```sh
clojure -M:dev:migrate up                        # apply unrun changesets
clojure -M:dev:migrate status                    # latest applied changeset
clojure -M:dev:migrate rollback last-deployment  # undo the last migrate up run
clojure -M:dev:migrate rollback deployment <id>  # undo everything after that deployment_id
```

`deployment_id`s are in the `databasechangelog_version` table (one row per deployment and Metabase version;
`ran_migrations` tells the version that ran the deployment from versions that merely booted against it). `rollback
count N` and `rollback id <id>` are raw Liquibase rollbacks that bypass the version bookkeeping; only use them for a
deliberate partial rollback.

The release command `migrate down` (`java -jar metabase.jar migrate down`, `mdb/migrate! :down`) rolls back to the
previous recorded **major** Metabase version and refuses a database whose newest deployment was made by a development
build, naming the dev tooling above. A release binary booted against such a database refuses the same way: roll the
development deployments back first, or rebuild the database.

## Related

- `bin/lint-migrations-file/` — the lint and its tests (`cd bin/lint-migrations-file && clojure -M:test`).
- `src/metabase/app_db/liquibase/versions.clj` — how deployments and their Metabase versions are recorded
  (`databasechangelog_version`, the `vNN.legacy-version-tracking` marker for older binaries).
- `src/metabase/app_db/liquibase/rollback.clj` — how `migrate down` and the dev rollback pick and reverse deployments.
- `dev/src/dev/migrate.clj` — the development tooling.
