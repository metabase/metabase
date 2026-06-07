# ci-conductor driver-test integration

Each driver test workflow (`.github/workflows/driver-*.yml`) asks
[ci-conductor](https://conductor.metaba.be) how it should run, and reports its
outcome back when finished. This lets us flip a driver between **skip**,
**info**, and **required** centrally — without editing or re-deploying CI.

This mirrors the existing e2e ci-conductor integration in
[`e2e/support/ci_conductor.ts`](../../../e2e/support/ci_conductor.ts): same
`x-internal-secret` auth header, same "never break CI" philosophy.

> ⚠️ The conductor `/api/config` endpoint is still in development. The
> request/response shapes below are a **best guess** and are isolated to the two
> scripts here plus the `conductor-check` / `conductor-report` composite actions,
> so they're cheap to change once the API firms up.

## Status semantics

| status     | runs tests? | fails job on test failure? | use case                              |
| ---------- | ----------- | -------------------------- | ------------------------------------- |
| `skip`     | no          | n/a                        | temporarily disable a driver          |
| `info`     | yes         | **no** (always green)      | gather data on a flaky/unstable driver |
| `required` | yes         | yes                        | normal, enforced (the default)        |

## Endpoints

Base URL: `CI_CONDUCTOR_API_URL` (default `https://conductor.metaba.be/api`).
Auth: `x-internal-secret: $CI_CONDUCTOR_WEBHOOK_SECRET` (reuses the existing
ci-conductor secret).

### Check — `GET /config`

```
GET /config?workflow=<name>&repo_id=<id>&ref=<branch>&sha=<sha>
-> 200 { "status": "skip" | "info" | "required" }
```

`get-status.sh` writes `status=<value>` to `$GITHUB_OUTPUT`. On a missing
secret, network error, non-2xx response, or unrecognized status it falls back to
`CI_CONDUCTOR_DEFAULT_STATUS` (default `required`) so CI behaves exactly as it
does today until conductor is wired up.

### Report — `POST /config`

```
POST /config
{
  "workflow":     "Driver Tests - Postgres",
  "job":          "test",
  "run_id":       123456789,
  "run_attempt":  1,
  "repo_id":      9876,
  "sha":          "<head sha>",
  "ref":          "<target branch>",
  "status":       "required",
  "outcome":      "success" | "failure" | "cancelled" | "skipped"
}
```

`report-result.sh` is best-effort: it no-ops without a secret and never exits
non-zero, so a reporting hiccup can't fail a driver job.

## Configuration (env)

| var                           | default                          | meaning                                   |
| ----------------------------- | -------------------------------- | ----------------------------------------- |
| `CI_CONDUCTOR_WEBHOOK_SECRET` | —                                | shared secret (`x-internal-secret` header) |
| `CI_CONDUCTOR_API_URL`        | `https://conductor.metaba.be/api`| API base URL                              |
| `CI_CONDUCTOR_DEFAULT_STATUS` | `required`                       | fallback when conductor can't be reached  |
| `CI_CONDUCTOR_DRY_RUN`        | `false`                          | log instead of calling                    |
