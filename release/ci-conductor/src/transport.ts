// Shared transport: POST a batch of normalized failures to ci-conductor's
// `/webhooks/failed-tests`. Call-site-agnostic — the backend posts once
// post-run; e2e posts per-spec mid-run (later round). Best-effort and never
// throws: reporting must not break a test run.
//
// The quarantine side of the conversation (fetch the list + check failures
// against it) lands here too in a later round — same host, same transport,
// reading the same `NormalizedTest[]` this reports.

import type { NormalizedTest, RunContext } from "./contract.ts";
import { log, toNumber } from "./util.ts";

// The endpoint can be slow, but the reporter must never hang a CI job.
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Resolve the run-level half of the body from the CI environment. This is the
 * payload's identity, not just log decoration: `repo_id`/`run_id`/`job_id` are
 * GitHub numeric IDs (foreign keys in ci-conductor), `sha`/`target_branch` tie
 * the failures to a commit/PR, and `test_suite` is the per-job dedup
 * discriminator. On PRs the ambient `GITHUB_SHA` is a synthetic merge commit
 * and `GITHUB_BASE_REF` the target, so the workflow sets `COMMIT_SHA`/
 * `TARGET_BRANCH` to the PR's head sha / base ref; we fall back to the ambient
 * vars (push runs, local). `JOB_ID` is exported by the `resolve-job-id`
 * composite action (null when unresolved — the column is nullable).
 */
function resolveRunContext(testSuite: string): RunContext {
  const env = process.env;
  return {
    repo_id: toNumber(env.REPO_ID ?? env.GITHUB_REPOSITORY_ID),
    run_id: toNumber(env.GITHUB_RUN_ID),
    attempt: toNumber(env.GITHUB_RUN_ATTEMPT),
    job_id: toNumber(env.JOB_ID),
    test_suite: testSuite,
    sha: env.COMMIT_SHA || env.GITHUB_SHA || null,
    target_branch: env.TARGET_BRANCH || env.GITHUB_BASE_REF || null,
  };
}

/**
 * Report the given normalized failures to ci-conductor by POSTing them to the
 * webhook under `testSuite`'s run-level context, no-opping when the webhook URL
 * isn't configured (local runs, PRs without the secret). Logs the resolved
 * identity (no secrets, no host) up front so a missing row in ci-conductor can
 * be correlated with — or ruled out against — this exact post. Never throws.
 */
export async function reportTestFailures(
  tests: NormalizedTest[],
  testSuite: string,
): Promise<void> {
  const baseUrl = process.env.CI_CONDUCTOR_BASE_URL;
  const context = resolveRunContext(testSuite);

  log(
    `run context: test_suite=${context.test_suite} sha=${context.sha} ` +
      `run_id=${context.run_id} attempt=${context.attempt} job_id=${context.job_id} ` +
      `repo_id=${context.repo_id} target_branch=${context.target_branch}`,
  );

  if (tests.length === 0) {
    log("no failing tests to report — skipping POST");
    return;
  }
  if (!baseUrl) {
    log(
      "CI_CONDUCTOR_BASE_URL not set — skipping POST (local run or missing secret)",
    );
    return;
  }

  try {
    const body = { ...context, tests };

    const endpoint = `${baseUrl.replace(/\/+$/, "")}/webhooks/failed-tests`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.CI_CONDUCTOR_WEBHOOK_SECRET) {
      // ci-conductor authenticates this endpoint via the x-internal-secret header.
      headers["x-internal-secret"] = process.env.CI_CONDUCTOR_WEBHOOK_SECRET;
    }

    // Path only — never the host (public repo). The secret is never logged.
    log(
      `POSTing ${tests.length} failure(s) to /webhooks/failed-tests ` +
        `(${headers["x-internal-secret"] ? "authenticated" : "no secret header"})`,
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        `[ci-conductor] failed-tests POST returned ${response.status} ${response.statusText}`,
      );
    } else {
      log(
        `ci-conductor accepted the report (${response.status} ${response.statusText})`,
      );
    }
  } catch (error) {
    console.error("[ci-conductor] failed to POST failed-tests", error);
  }
}
