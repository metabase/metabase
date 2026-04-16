---
name: e2e-test
description: Run Cypress E2E tests, analyze failures including screenshots, and stress test for flakiness
disable-model-invocation: false
---

Run Cypress E2E test: $ARGUMENTS

## Edition selection

**Default: `MB_EDITION=oss`** — runs without enterprise tokens, simpler and faster.

Only use `MB_EDITION=ee` when the user explicitly asks to write or run an enterprise test.

**For `MB_EDITION=ee`:**
These tokens must be exported in the shell before starting Claude Code:
- `CYPRESS_MB_ALL_FEATURES_TOKEN` — all features (most EE tests need this)
- `CYPRESS_MB_PRO_SELF_HOSTED_TOKEN` — pro self-hosted (permissions, SSO, sandboxing)
- `CYPRESS_MB_STARTER_CLOUD_TOKEN` — starter plan (rarely needed)
- `CYPRESS_MB_PRO_CLOUD_TOKEN` — pro cloud (rarely needed)

**NEVER echo, print, or log token values. Only check if they are set:**
```bash
echo "ALL_FEATURES: ${CYPRESS_MB_ALL_FEATURES_TOKEN:+set}" && echo "PRO_SELF_HOSTED: ${CYPRESS_MB_PRO_SELF_HOSTED_TOKEN:+set}" && echo "STARTER: ${CYPRESS_MB_STARTER_CLOUD_TOKEN:+set}" && echo "PRO_CLOUD: ${CYPRESS_MB_PRO_CLOUD_TOKEN:+set}"
```

If tokens are missing, tell the user: "EE tokens are not set. Either export them and restart Claude Code, or add `MB_EDITION=oss` to run OSS-only tests."

## Running

First check if snapshots exist:
```bash
ls e2e/snapshots/default.sql 2>/dev/null && echo "snapshots exist" || echo "snapshots missing"
```

If snapshots exist, skip regeneration for speed:
```bash
MB_EDITION=oss CYPRESS_VIDEO=false CYPRESS_RETRIES=0 CYPRESS_GUI=false GENERATE_SNAPSHOTS=false bun test-cypress $ARGUMENTS
```

If snapshots are missing (first run), let the runner generate them:
```bash
MB_EDITION=oss CYPRESS_VIDEO=false CYPRESS_RETRIES=0 CYPRESS_GUI=false bun test-cypress $ARGUMENTS
```

When running enterprise tests, replace `MB_EDITION=oss` with `MB_EDITION=ee` in the commands above.

If `$ARGUMENTS` is empty, ask the user which spec to run.

If the user provides a test name or fuzzy name instead of a spec path, find the spec file:
```bash
find e2e/test/scenarios -name "*FUZZY_NAME*.cy.spec.*" -type f
```
Then run with `--spec "path/to/matched.cy.spec.js"`.

To filter by test name, use the `GREP` env var (not `--env grep=`, which breaks on commas):
```bash
GREP="test name here" MB_EDITION=oss bun test-cypress --spec path/to/spec.js
```

## Stress test (flaky detection)

When the user asks to verify a test is not flaky:

```bash
MB_EDITION=oss bin/e2e-stress-test $ARGUMENTS
```

Set `E2E_STRESS_RUNS=N` for more iterations (default: 5). Stops on first failure and prints screenshot paths. Read those screenshots to analyze the failure.

## Analyzing failures

When tests fail:

1. Read the **screenshot** for each failure — paths are printed in Cypress output under `(Screenshots)`, typically at `cypress/screenshots/<spec-name>/<test-name> (failed).png`
2. Read the error message and code frame from the console output
3. Identify the root cause: is it a test bug, a product bug, or a timing issue?
4. Suggest a fix with specific code changes
