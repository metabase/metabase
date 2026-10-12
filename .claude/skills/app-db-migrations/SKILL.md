---
name: app-db-migrations
description: Add, test, run and roll back application-database (Liquibase) migrations. Use when adding a changeset, changing a table or column in the Metabase app DB, writing a custom (Clojure) migration, or rolling migrations back in development.
---

# Application DB migrations

Schema changes to the Metabase application database are Liquibase changesets in YAML under `resources/migrations/`.
Every changeset in the repository is linted by `./bin/lint-migrations-file.sh` (`mage lint-migrations`); run it before
pushing.

## Where a new changeset goes

Starting with v66, new changesets are **version-less** and live in a year directory. Create one with
`./bin/mage new-migration <snake_case_name>`, which writes:

```
resources/migrations/2026/20261012_short_snake_case_name.yaml   # changeset id: short_snake_case_name
```

- The directory is the current year; the file name is `<yyyymmdd>_<snake_case_name>.yaml` (lower-case letters,
  digits and underscores only). One file per change or per closely related group of changes; several changesets in
  one file are fine.
- The changeset **id carries no version**: lower-case letters, digits and underscores, with at least one letter, e.g.
  `glossary_entity_id`, `metabot_message_data_version_1`. Not an ISO date or timestamp like the old ids carried
  (`2026-09-18T12:00:00`), not `v66.…`, not all digits, no `v<digit>` prefix. Ids must be unique across the
  repository, so make them specific. `new-migration` uses the name as the first changeset's id and refuses one that
  is already taken.
- The Metabase version a changeset ships in is decided by the branch it is merged into, not by anything in the file.
  A backport to v66 or later is the same file with the same id and author on the release branch; Liquibase then
  recognises it as already run when the customer upgrades.

Do **not** add new work to the versioned files (`migrations/0NN/…` with `vNN.` ids, or `0NN_update_migrations.yaml`).
They cover v65 and earlier, which shipped without version-less support, and the lint refuses `vNN.` ids for 66 and
later.

### Backporting to v65 or earlier

v65 and earlier binaries don't support version-less changesets, so a backport to them is a **versioned copy**:
`./bin/mage new-migration 65 <snake_case_name>` writes `resources/migrations/065/<yyyymmdd>_<name>.yaml` with a
`v65.<random>` id. Add the copy on master and on the release branch, and guard both copies so that a database runs
only one of them:

- the `065/` copy gets `preConditions: [onFail: MARK_RAN, not: changeSetExecuted: <the version-less id>]`, for
  databases that already ran the version-less changeset (a 66+ release that shipped before the backport);
- the version-less changeset gets the mirror precondition on the `v65.` id. `065/` sorts before `2026/`, so a fresh
  install and every database that ran the v65 backport run the copy first, and the original must then be skipped.

`changeSetExecuted` needs `id`, `author` and `changeLogFile` (e.g. `migrations/2026/20261012_name.yaml`).
`resources/migrations/064/20260911_glossary_entity_id.yaml` shows the precondition shape (from an earlier
versioned-to-versioned backport).

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
  snapshots the whole schema to answer them. Preconditions are rarely needed at all: rely on Liquibase's changeset
  tracking.
- No `deleteCascade` on an `addColumn` constraint (add the foreign key with `addForeignKeyConstraint` instead).
- Migrations must work on H2, PostgreSQL and MySQL/MariaDB; anything database-specific gets a `dbms:` filter.
- **Shipped changesets are immutable.** Fix a mistake with a new changeset; never edit or delete one that a release
  contains. `runOnChange: true` changesets (views) are the one exception and may be edited in place.

## Retiring a shipped changeset

Never just delete a shipped changeset: instances keep its row in `DATABASECHANGELOG` forever, Liquibase then logs it
as "not rolled back", and any replacement that recreates the same object fails with a duplicate-object error. To
retire one when you must, add a new changeset that runs `DELETE FROM DATABASECHANGELOG WHERE id IN (...)` for the
retired ids (`resources/migrations/059_update_migrations.yaml::v59.2026-01-09T11:30:00` retires
`v58.2026-01-09T12:00:00`).

## Data migrations (Clojure)

Prefer SQL changesets. Anything that SQL can't express goes in `src/metabase/app_db/custom_migrations.clj` (larger
ones get their own namespace under `custom_migrations/`) with
`define-reversible-migration` (or `define-migration` when there is nothing to reverse), referenced from a changeset:

```yaml
      changes:
        - customChange:
            class: metabase.app_db.custom_migrations.MigrateSomething
      rollback:
```

Custom migrations are append-only, must be idempotent and resumable, and must batch their work: never hold a write
lock on a large table for the whole run. They run inside a transaction and must use table names, never `:model/*` or
other application code: that code changes after the migration ships and breaks it (some older migrations use
`:model/*`; don't copy them). Decrypt encrypted columns such as `metabase_database.details` and `setting.value`
before reading them. The `metabase.app-db.*` module, custom migrations included, is exempt from the `<module>.db`
rule.

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

See the macro's docstring for asserting on the rollback too. Run them on H2 and Postgres, and add MySQL when the
change touches DDL or JSON columns. On H2, in a fresh JVM:

```sh
MB_DB_TYPE=h2 ./bin/test-agent :only '[metabase.app-db.schema-migrations-test/glossary-entity-id-test]'
```

## Running and rolling back in development

Every `migrate up` run is recorded as its own Liquibase deployment. Use the dev tooling (in the REPL,
`(dev.migrate/migrate!)`, `(dev.migrate/rollback! :last-deployment)` and `(dev.migrate/rollback! :deployment <id>)`;
or the CLI below — it needs the `:dev` alias):

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
