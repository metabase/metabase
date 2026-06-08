#!/usr/bin/env bun
//
// report-result.ts — tell ci-conductor how a driver workflow turned out.
//
// Called at the end of a driver workflow to POST the run's outcome back to
// conductor.metaba.be/api/config, so conductor can track per-workflow
// pass/fail/flake history and drive future skip/info/required decisions.
//
// Inputs (via env):
//   CI_CONDUCTOR_STATUS   the status the job ran under (skip|info|required)
//   CI_CONDUCTOR_OUTCOME  the test outcome (success|failure|cancelled|skipped)
//
// Best-effort and non-fatal, exactly like the e2e reporter
// (e2e/support/ci_conductor.ts): a reporting problem must never change a job's
// result. No-ops when no secret is configured. Always exits 0.
//
// The conductor API is still in development; the shape below is a best guess:
//   POST ${CI_CONDUCTOR_API_URL}/config
//   { workflow, repo_id, run_id, run_attempt, job, sha, ref, status, outcome }
//
// Run with: bun .github/scripts/conductor/report-result.ts

const {
  CI_CONDUCTOR_API_URL = "https://conductor.metaba.be/api",
  CI_CONDUCTOR_WEBHOOK_SECRET = "",
  CI_CONDUCTOR_DRY_RUN = "false",
  CI_CONDUCTOR_WORKFLOW,
  GITHUB_WORKFLOW,
  GITHUB_JOB = "",
  GITHUB_RUN_ID,
  GITHUB_RUN_ATTEMPT,
  REPO_ID,
  COMMIT_SHA,
  GITHUB_SHA = "",
  TARGET_BRANCH,
  GITHUB_REF_NAME = "",
  CI_CONDUCTOR_STATUS = "",
  CI_CONDUCTOR_OUTCOME = "",
} = process.env;

const isDryRun = CI_CONDUCTOR_DRY_RUN === "true";
const log = (msg: string) => console.log(`[ci-conductor] ${msg}`);

/** Parse a numeric env var, treating missing/blank/non-numeric as null. */
function toNumber(value: string | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function main(): Promise<void> {
  const body = {
    workflow: CI_CONDUCTOR_WORKFLOW ?? GITHUB_WORKFLOW ?? "",
    job: GITHUB_JOB,
    run_id: toNumber(GITHUB_RUN_ID),
    run_attempt: toNumber(GITHUB_RUN_ATTEMPT),
    repo_id: toNumber(REPO_ID),
    sha: COMMIT_SHA || GITHUB_SHA || null,
    ref: TARGET_BRANCH || GITHUB_REF_NAME || null,
    status: CI_CONDUCTOR_STATUS,
    outcome: CI_CONDUCTOR_OUTCOME,
  };

  if (isDryRun) {
    log(`(dry run) would POST result: ${JSON.stringify(body)}`);
    return;
  }

  if (!CI_CONDUCTOR_WEBHOOK_SECRET) {
    log("no CI_CONDUCTOR_WEBHOOK_SECRET set; not reporting result");
    return;
  }

  const endpoint = `${CI_CONDUCTOR_API_URL.replace(/\/+$/, "")}/config`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-internal-secret": CI_CONDUCTOR_WEBHOOK_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    log(
      `result POST failed (${error instanceof Error ? error.message : error}); ignoring`,
    );
    return;
  }

  if (response.ok) {
    log(
      `reported outcome '${body.outcome}' (ran as '${body.status}') -> HTTP ${response.status}`,
    );
  } else {
    log(`result POST returned HTTP ${response.status}; ignoring`);
  }
}

// Reporting must never throw into the job — swallow everything.
main().catch((error) => log(`failed to report result (${error}); ignoring`));
