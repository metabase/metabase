# v63 H2-removal upgrade test

Confirms the `defer-h2-loading` changes work end to end: a v63 cloud image with the **H2 library
fully removed** (classes **and** the `org.h2.Driver` ServiceLoader entry) boots on a Postgres
application DB, migrates the bundled H2 Sample Database to SQLite on upgrade, and works normally --
with nothing referencing an H2 class at boot.

## What it exercises

- The metabase `defer-h2-loading` branch: H2 is no longer loaded eagerly at boot, and no
  always-loaded namespace references an H2 class.
- The metabase-ee-extra removal step: `.github/scripts/remove-h2-from-jar.sh` strips the H2 classes
  and the dangling `org.h2.Driver` service registration. **This test runs that exact script**, so a
  reviewer validates the real packaging path.
- The H2 -> SQLite Sample Database migration on the existing-install upgrade path.

## Prereqs

- Docker running.
- `GH_TOKEN` exported (to download the branch's CI uberjar via `./bin/mage jar-download`).
- The **metabase-ee-extra** branch checked out at `$EE_EXTRA_DIR` (default `~/Projects/metabase-ee-extra`)
  — its `Dockerfile` + `remove-h2-from-jar.sh` are used.

## Run

```bash
cd v63-upgrade-test
export GH_TOKEN=...
./run-all.sh
```

Ends with `RESULT: PASS` (or `FAIL` + a non-zero exit). Then tear down:

```bash
./99-teardown.sh --all   # containers, network, app-DB volume, build/
```

## What PASS means (checks in `05`)

- v63 boots healthy on Postgres with H2 removed (no `pg_ts_config`/driver hang).
- Sample DB `engine=sqlite` (was H2), synced (tables + fields > 0), no H2 DBs remain.
- No `ClassNotFound org.h2` / `No suitable driver` in the logs.
- The v62 admin user is preserved; the migrated sample DB is reachable via the API.

## Steps (what `run-all.sh` chains)

| Script | Does |
|--------|------|
| `01-build-jar.sh` | download `$MB_REF` CI uberjar -> re-stamp `tag=v1.63.0` -> run the ee-extra `remove-h2-from-jar.sh` |
| `02-build-image.sh` | build the ee-extra image (`FROM $EE_BASE_TAG`) with the stripped jar |
| `03-postgres.sh` | start the shared Postgres app DB (persistent volume) |
| `04-run-v62.sh` | boot official `$EE_BASE_TAG` -> seed H2 sample + create admin (via `/api/setup`) |
| `05-run-v63.sh` | boot the v63 image on the same app DB -> verify migration + health (PASS/FAIL) |

Run them individually for step-by-step debugging. Config/overrides are in `config.sh`
(`MB_REF`, `EE_BASE_TAG`, `EE_EXTRA_DIR`, admin creds, docker names).

## Notes

- `04` completes admin setup so the upgrade takes the **existing-install** path
  (`update-sample-database-if-needed!` -> `replace-sample-database!`); a fresh install would create a
  SQLite sample outright and skip the migration.
- `$EE_BASE_TAG` (default `v1.62.3`) is both the Docker base image and the v62 upgrade source; bump it
  to the latest public v62 patch if desired.
