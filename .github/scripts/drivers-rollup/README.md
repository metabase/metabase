# drivers-rollup

Aggregates the individual driver checks (`drivers-tests-*`) into a single
`drivers-tests-result` check-run, driven by
[ci-test-config](https://raw.githubusercontent.com/metabase/ci-test-config/refs/heads/master/ci-test-config.json).

This replaces the old `drivers-tests-result` job that lived inside `drivers.yml`.
The drivers now report independently, so we can't aggregate them with a `needs:`
block — instead [`.github/workflows/drivers-rollup.yml`](../../workflows/drivers-rollup.yml)
listens for their check-runs and rolls them up via the GitHub Checks API.

## Config (`drivers` key)

```json
"drivers": [
  { "id": "drivers-tests-databricks-ee", "status": "skip" },
  { "id": "drivers-tests-snowflake-ee",  "status": "info" },
  { "id": "drivers-tests-bigquery-ee",   "status": "info" }
]
```

| status     | gates `drivers-tests-result`? | the driver job itself                |
| ---------- | ----------------------------- | ------------------------------------ |
| `required` | **yes**                       | normal (fails the job on failure)    |
| `info`     | no                            | **passes no matter what** (data only) |
| `skip`     | no                            | (typically skipped upstream by mage) |

**Anything not listed defaults to `required`.**

## How the rollup decides (`rollup.ts`, unit-tested)

For the commit's check-runs:

- pending (`in_progress`) while any **required** driver check is still running;
- **failure** if any required driver check failed;
- **success** once every required driver check has completed and passed
  (`skipped`/`neutral` count as passing), including the "zero required" case.

`info` and `skip` checks never affect the result. The check-run's `output`
carries a per-driver debug table (config status, run status, conclusion, verdict).

### Name → config-id matching (`config.ts`)

Driver job `name:`s are set to their ids, so check-run leaves look like
`drivers-tests-postgres (Postgres 14.x Driver Tests)`. The script strips any
reusable-workflow caller prefix (`driver-tests / …`) and matches a leaf to an id
when it equals the id or starts with `id + " ("` — the `" ("` boundary stops
`drivers-tests-mongo` from swallowing `drivers-tests-mongo-ssl`.

## The "info → job passes" path

Separately from the rollup, an `info` driver's **own** job is made to pass via
`upload-test-results`' optional `driver-id` input (each driver job passes
`${{ github.job }}`). The action runs [`job-status.ts`](./job-status.ts) (same
tested config logic) and, when the id is `info`, marks the Trunk step
`continue-on-error` so the job's exit code can't go red.

## Running the tests

```bash
cd .github/scripts/drivers-rollup && bun test
```

(Named `*.test.ts` so bun picks them up; the repo's jest only matches
`*.unit.spec.*`, so these are bun-only.)

## ⚠️ Rollout / branch protection (manual)

1. **`check_run` workflows only run from the file on the repo's _default branch_**,
   in the base-repo context. So `drivers-rollup.yml` does nothing until it's on
   `master`, and can't be exercised end-to-end on a feature branch (test the
   logic with `bun test` instead).
2. The old required check was `driver-tests / drivers-tests-result` (produced
   inside `drivers.yml`). It's gone now; the rollup produces a top-level
   **`drivers-tests-result`** check instead.
3. Sequence to avoid a stuck merge:
   - Temporarily **remove `driver-tests / drivers-tests-result`** from the
     required checks so this change can merge (its old producer is deleted and
     the rollup isn't on `master` yet).
   - Merge to `master`.
   - **Add `drivers-tests-result`** (the rollup's context) as the required check.
