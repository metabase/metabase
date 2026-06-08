# Driver tests: monolith → per-driver workflows (migration notes)

The single `drivers.yml` reusable workflow was split into one standalone workflow
per driver (`driver-*.yml`). Shared logic lives in reusable pieces:

- **`_driver-decide.yml`** — reusable workflow: `mage -driver-decisions` (selective
  run + quarantine) **plus** a ci-conductor status check (`skip`/`info`/`required`).
- **`.github/actions/driver-decision`** — runs mage for a single driver.
- **`.github/actions/conductor-check`** / **`conductor-report`** — talk to
  `conductor.metaba.be/api/config` (see `.github/scripts/conductor/README.md`).
- **`.github/actions/driver-gate`** — the per-driver `result` gate.
- **`.github/actions/test-driver`** / **`upload-test-results`** — unchanged.

Each driver workflow has three jobs: `decide` → `test` → `result`. `result` always
runs and is the driver's required status check.

## ⚠️ Branch protection must be updated (manual, one-time)

GitHub Actions can't aggregate jobs across separate workflow files, so the old
single required check **`drivers-tests-result`** no longer exists. Until branch
protection is updated, that stale required check will block all PRs.

**In the repo's branch protection rule (or ruleset) for `master` + `release-**`:**

1. **Remove** the old required check: `drivers-tests-result`
2. **Add** these required checks (each is a driver's always-run `result` job):

   ```
   H2 result
   Athena result
   ClickHouse result
   Databricks result
   Druid JDBC result
   Mongo result
   Mongo SSL result
   Mongo Sharded Cluster result
   MySQL MariaDB result
   Oracle result
   Postgres result
   Presto JDBC result
   Redshift result
   Spark SQL result
   SQLite result
   SQL Server result
   ```

   These are exactly the drivers that were in the old `drivers-tests-result`
   `needs:` list. Each `result` job is uniquely named so the contexts don't collide.

3. **Do NOT add** these — they run for data only (matching the old aggregator,
   which excluded them). Prefer setting them to `info` in conductor:

   ```
   BigQuery result      # unreliable; gather data only
   Snowflake result     # unreliable; gather data only
   Vertica result       # disabled pending a docker image update
   ```

> If the runner shows checks as `Driver Tests - Postgres / Postgres result`, use
> whatever form the branch-protection search box surfaces — the `result` job names
> are unique either way.

## Secrets / variables

- `CI_CONDUCTOR_WEBHOOK_SECRET` — already configured for e2e; reused here as the
  `x-internal-secret` header. Until it's present (or `/api/config` exists), every
  driver falls back to `required`, i.e. behaves exactly as before.
- `CI_CONDUCTOR_API_URL` *(optional repo var)* — defaults to
  `https://conductor.metaba.be/api`.

## Rollback

Restore `.github/workflows/drivers.yml`, re-add the `driver-tests` job in
`run-tests.yml`, and re-require `drivers-tests-result` in branch protection.
