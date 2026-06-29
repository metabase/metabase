// Shared transport: POST a batch of normalized failures to ci-conductor's
// `/webhooks/failed-tests`. Call-site-agnostic — the backend posts once
// post-run; e2e posts per-spec mid-run (later round). Best-effort and never
// throws: reporting must not break a test run.
//
// The quarantine side of the conversation (fetch the list + check failures
// against it) lands here too in a later round — same host, same transport,
// reading the same `NormalizedTest[]` this reports.

import type { NormalizedTest, RunContext } from "./contract.ts";
import { log } from "./util.ts";

// The endpoint can be slow, but the reporter must never hang a CI job.
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Report the given normalized failures to ci-conductor by POSTing them to the
 * webhook, no-opping when the webhook URL isn't configured (local runs, PRs
 * without the secret). Logs the resolved identity (no secrets, no host) up
 * front so a missing row in ci-conductor can be correlated with — or ruled out
 * against — this exact post. Never throws.
 */
export async function reportTestFailures(
  tests: NormalizedTest[],
  context: RunContext,
): Promise<void> {
  const baseUrl = process.env.CI_CONDUCTOR_BASE_URL;

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
