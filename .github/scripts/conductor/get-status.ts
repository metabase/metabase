#!/usr/bin/env bun
//
// get-status.ts — ask ci-conductor how a driver workflow should run.
//
// Queries conductor.metaba.be/api/config with the workflow name and writes the
// resulting status (skip | info | required) to $GITHUB_OUTPUT as `status=...`.
//
//   skip      the workflow should not run its tests at all
//   info      run the tests, but never fail the job (gather data only)
//   required  run the tests and fail the job on failure (the default)
//
// This is a *read* of conductor's config — it must never break CI. On a missing
// secret, an unreachable service, a non-2xx response, or an unrecognized status
// we fall back to $CI_CONDUCTOR_DEFAULT_STATUS (default "required", i.e. behave
// exactly as today). The script always exits 0; the caller gates on the status.
//
// The conductor API is still in development, so the request/response shape here
// is a best guess and intentionally easy to change:
//   GET ${CI_CONDUCTOR_API_URL}/config?workflow=<name>&repo_id=<id>&ref=<branch>&sha=<sha>
//   -> 200 {"status":"skip"|"info"|"required"}
// Authenticated with the shared x-internal-secret header, matching the existing
// ci-conductor integration in e2e/support/ci_conductor.ts.
//
// Run with: bun .github/scripts/conductor/get-status.ts

import { appendFileSync } from "node:fs";

type Status = "skip" | "info" | "required";

const {
  // Base URL for the conductor API. Defaults to production; overridable so the
  // endpoint can move while it's in development.
  CI_CONDUCTOR_API_URL = "https://conductor.metaba.be/api",
  CI_CONDUCTOR_WEBHOOK_SECRET = "",
  CI_CONDUCTOR_DRY_RUN = "false",
  CI_CONDUCTOR_DEFAULT_STATUS = "required",
  // Identifying context. These GITHUB_* vars are set automatically on every
  // runner; REPO_ID / COMMIT_SHA / TARGET_BRANCH may be supplied by the caller
  // for precision on pull_request events (GITHUB_SHA is the merge sha there).
  CI_CONDUCTOR_WORKFLOW,
  GITHUB_WORKFLOW,
  REPO_ID = "",
  COMMIT_SHA,
  GITHUB_SHA = "",
  TARGET_BRANCH,
  GITHUB_REF_NAME = "",
  GITHUB_OUTPUT,
} = process.env;

const workflow = CI_CONDUCTOR_WORKFLOW ?? GITHUB_WORKFLOW ?? "";
const sha = COMMIT_SHA || GITHUB_SHA;
const ref = TARGET_BRANCH || GITHUB_REF_NAME;
const isDryRun = CI_CONDUCTOR_DRY_RUN === "true";

const log = (msg: string) => console.log(`[ci-conductor] ${msg}`);

const isStatus = (value: string): value is Status =>
  value === "skip" || value === "info" || value === "required";

let defaultStatus: Status = "required";
if (isStatus(CI_CONDUCTOR_DEFAULT_STATUS)) {
  defaultStatus = CI_CONDUCTOR_DEFAULT_STATUS;
} else {
  log(
    `ignoring invalid CI_CONDUCTOR_DEFAULT_STATUS='${CI_CONDUCTOR_DEFAULT_STATUS}', using 'required'`,
  );
}

function emit(status: Status): void {
  log(`status for workflow '${workflow}': ${status}`);
  if (GITHUB_OUTPUT) {
    appendFileSync(GITHUB_OUTPUT, `status=${status}\n`);
  } else {
    // Local / test runs without a GITHUB_OUTPUT file.
    console.log(`status=${status}`);
  }
}

async function main(): Promise<void> {
  // No secret configured (forks, local runs, secret not yet provisioned):
  // no-op and behave as today.
  if (!CI_CONDUCTOR_WEBHOOK_SECRET && !isDryRun) {
    log(`no CI_CONDUCTOR_WEBHOOK_SECRET set; defaulting to '${defaultStatus}'`);
    emit(defaultStatus);
    return;
  }

  const query = new URLSearchParams({
    workflow,
    repo_id: REPO_ID,
    ref,
    sha,
  });
  const url = `${CI_CONDUCTOR_API_URL.replace(/\/+$/, "")}/config?${query}`;

  if (isDryRun) {
    log(`(dry run) would GET ${url}`);
    emit(defaultStatus);
    return;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "x-internal-secret": CI_CONDUCTOR_WEBHOOK_SECRET,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    log(
      `request failed (${error instanceof Error ? error.message : error}); defaulting to '${defaultStatus}'`,
    );
    emit(defaultStatus);
    return;
  }

  if (!response.ok) {
    log(`unexpected HTTP ${response.status}; defaulting to '${defaultStatus}'`);
    emit(defaultStatus);
    return;
  }

  let status: unknown;
  try {
    status = ((await response.json()) as { status?: unknown }).status;
  } catch {
    status = undefined;
  }

  if (typeof status === "string" && isStatus(status)) {
    emit(status);
  } else {
    log(
      `response had no valid status (got '${status ?? "<none>"}'); defaulting to '${defaultStatus}'`,
    );
    emit(defaultStatus);
  }
}

// Never let a failure here break the gate — always resolve to a status.
main().catch((error) => {
  log(`unexpected error (${error}); defaulting to '${defaultStatus}'`);
  emit(defaultStatus);
});
