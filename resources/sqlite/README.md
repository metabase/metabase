# SQLite application database baseline

SQLite support starts at the v65 schema represented by `baseline.sql`. A fresh database runs one real Liquibase changeset, `v65.2026-09-24T00:00:00-sqlite-baseline`. It does not replay historical migrations or pretend they ran.

`baseline-changesets.edn` freezes the exact `[logical-path author id]` identities already represented by the snapshot. The SQLite changelog includes the shared changelog; the wrapper removes those exact identities before validation/execution. New migrations remain eligible even when added to an older release directory. SQL-only migrations must explicitly include SQLite where they specify `dbms`. Unsupported SQLite ALTER operations still need SQLite implementations, usually table reconstruction. Downgrading below v65 is rejected.

The snapshot contains the current application schema, foreign keys, unique/generated columns, indexes, all eleven Quartz tables, all twenty analytics views, and the public seed content installed by a fresh migration (Trash, internal user, permissions, sample content, transform jobs, and settings). The additional `secret_id_sequence` table supplies IDs for the versioned `secret` table, whose composite primary key cannot use SQLite AUTOINCREMENT. Timestamps retain the `TIMESTAMP WITH TIME ZONE` declaration and use UTC text with six fractional digits; booleans retain the `BOOLEAN` declaration.

## Rebuilding before the baseline ships

From the project development REPL:

```clojure
(require 'dev.sqlite-baseline)
(dev.sqlite-baseline/export! "/tmp/sqlite-reference.json")
```

Then, from the repository root:

```sh
python3 bin/sqlite/generate_baseline.py /tmp/sqlite-reference.json
```

The exporter creates its own empty in-memory H2 database, migrates it, and exports JDBC schema metadata and public seed rows. It never accepts a live application database. Historical scheduler migrations are disabled for this empty reference. The generator normalizes generation timestamps, randomly generated internal-user/group entity IDs, and H2-generated index names, producing identical SQL across independent reference databases. It validates foreign keys, integrity, and queries every view before writing the artifact. Analytics views are translated from the actual resulting H2 definitions; `views/alerts.sql` supplies the SQLite cron parsing equivalent.

Review and freeze the SQL and manifest together. Once shipped, do not regenerate either file: use normal forward migrations. Generation does not happen at application startup and requires no Postgres service.

## Validation

`metabase.app-db.liquibase.sqlite-test` exercises actual Liquibase creation/reopen, schema and data migrations after the baseline, exact identity filtering, rollback/retry after a failed migration, integrity/foreign keys, analytics views, and the single-writer migration connection boundary.

This is an opt-in dev/preview backend. The baseline does not make every future shared migration automatically SQLite compatible. After an abrupt kill during migration, the default Liquibase lock row may require explicit recovery; do not clear it while another process is migrating the same file.
