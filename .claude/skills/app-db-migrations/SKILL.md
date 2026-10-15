---
name: app-db-migrations
description: Add, test, run and roll back application-database (Liquibase) migrations. Use when adding a changeset, changing a table or column in the Metabase app DB, writing a custom (Clojure) migration, or rolling migrations back in development.
---

# Application DB migrations

Schema changes to the Metabase application database are Liquibase changesets in YAML under `resources/migrations/`.
Every changeset in the repository is linted by `./bin/lint-migrations-file.sh` (`mage lint-migrations`); run it before
pushing.

## Where a new changeset goes

New changesets are **version-less** and live in a year directory. Create one with
`./bin/mage new-migration <snake_case_name>`, which writes:

```
resources/migrations/2026/20261012_short_snake_case_name.yaml   # changeset id: a random one, e.g. k3x9qa
```

- The directory is the current year; the file name is `<yyyymmdd>_<snake_case_name>.yaml` (lower-case letters,
  digits and underscores only). One file per change or per closely related group of changes; several changesets in
  one file are fine.
- The changeset **id is a random identifier with no version**, e.g. `k3x9qa`: `new-migration` generates one for the
  first changeset, checking it is unused in `resources/migrations`. For more changesets in the same file, make up
  another the same way and grep to confirm it is unused. The lint accepts lower-case letters, digits and underscores
  with at least one letter -- not an ISO date or timestamp like the old ids carried (`2026-09-18T12:00:00`), not
  `v66.…`, not all digits, and no leading `v`: releases from before version-less support read the schema's version
  from the highest `id LIKE 'v%'`.
- The Metabase version a changeset ships in is decided by the branch it is merged into, not by anything in the file.

Do **not** start new work in the versioned files (`migrations/0NN/…` with `vNN.` ids, or `0NN_update_migrations.yaml`).
The lint still accepts `vNN.` ids up to v66, so changesets already in flight for 66 can land, and refuses them from
v67 on. Don't add versioned changesets on release branches either: changelog order puts every versioned file before
the year directories, so a versioned changeset added after a version-less one would run before it on a fresh install
but after it on an upgraded one.

## Backporting a changeset

Version-less support is backported to patch releases of every supported major back to v58, so a
version-less changeset is backported like any other change: cherry-pick the **same file** onto each release branch.
Liquibase identifies a changeset by file path, id and author, so the upgraded customer's database already has it as
run. A few rules follow from the same changeset meeting different histories:

- **The file must be byte-identical on every branch.** Liquibase checksums ran changesets, and a different body on
  another branch fails checksum validation when a customer upgrades onto it. Fix a mistake with a new changeset.
- **Ship it on every branch from the oldest target up to master.** A customer can upgrade from any patch of an older
  major to any later one.
- **Use only schema that exists in the oldest major it targets.**
- **It runs at different points in different histories.** On a fresh install of a newer major it runs after that
  major's `vNN.` changesets; on a database upgraded from an older major's patch it already ran before them. Make sure
  none of the later majors' changesets conflict with it either way round, e.g. by both creating the same object.
- Customers on a patch from before the backport still boot against a database it ran on: those releases ignore
  changelog rows they don't know, and Metabase keeps a marker row last in `databasechangelog` so they read the schema's
  version correctly (see `metabase.app-db.liquibase.versions/record-legacy-version-tracking!`).

## Writing the changeset

```yaml
databaseChangeLog:
  - changeSet:
      id: k3x9qa
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
  (impl/test-migrations ["k3x9qa"] [migrate!]
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
