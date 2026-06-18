#!/usr/bin/env bun

// Quarantine gate (DEV-2082). After an e2e job runs, compare the tests that
// *ultimately failed* against the quarantine list served by ci-conductor and
// decide whether the job should pass or fail:
//
//   - No failures                    -> pass (nothing to gate)
//   - Every failure is quarantined   -> pass (exit cleanly)
//   - Any failure is NOT quarantined -> fail
//
// This mirrors what Trunk's analytics-uploader currently does for us; the goal
// is to eventually replace that. For now the gate runs in DRY-RUN mode: it
// computes and prints the verdict but always exits 0, so it can be observed in
// CI without affecting job outcomes. Flip QUARANTINE_DRY_RUN=false to enforce.
//
// The failures come from the file written by after:spec
// (`recordFailedTestsForQuarantine` in ci_conductor.ts). Both that file and
// ci-conductor's quarantine list derive {test_name, test_path, file_path} from
// the same Cypress title array, so the comparison here is exact.

import { readFileSync } from "node:fs";

import {
  type FailedTest,
  type QuarantineEntry,
  compareFailedToQuarantine,
} from "./quarantine-compare";

const {
  CI_CONDUCTOR_BASE_URL,
  CI_CONDUCTOR_WEBHOOK_SECRET,
  // Default to a dry run: compute and print the verdict, but never fail the
  // job. Set to "false" to actually gate the build on the verdict.
  QUARANTINE_DRY_RUN,
  QUARANTINE_FAILURES_FILE,
} = process.env;

const isDryRun = QUARANTINE_DRY_RUN !== "false";

// The test suite to gate. ci-conductor keys its quarantine list by suite.
const TEST_SUITE = "e2e";

const failuresFile =
  QUARANTINE_FAILURES_FILE ?? "./target/quarantine-failures.jsonl";

/** Read the run's failed tests from the JSONL file. */
function readFailedTests(file: string): FailedTest[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    console.log(`[quarantine] no failures file at ${file}; nothing to gate.`);
    return [];
  }

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line): FailedTest | null => {
      try {
        return JSON.parse(line) as FailedTest;
      } catch {
        console.error(`[quarantine] skipping unparseable line: ${line}`);
        return null;
      }
    })
    .filter((test): test is FailedTest => test !== null);
}

/**
 * Build the quarantine list URL from the ci-conductor base origin secret. The
 * reporter posts to ".../webhooks/failed-tests"; the quarantine list lives at
 * ".../api/quarantine" on the same host.
 */
function quarantineUrl(): string | null {
  if (!CI_CONDUCTOR_BASE_URL) {
    return null;
  }
  const base = CI_CONDUCTOR_BASE_URL.replace(/\/+$/, "");
  return `${base}/api/quarantine?suite=${TEST_SUITE}`;
}

/** Fetch the quarantine list, or null if it can't be retrieved. */
async function fetchQuarantine(): Promise<QuarantineEntry[] | null> {
  const url = quarantineUrl();
  if (!url) {
    console.log(
      "[quarantine] CI_CONDUCTOR_BASE_URL is unset; cannot fetch the quarantine list.",
    );
    return null;
  }
  try {
    const headers: Record<string, string> = {};
    if (CI_CONDUCTOR_WEBHOOK_SECRET) {
      headers["x-internal-secret"] = CI_CONDUCTOR_WEBHOOK_SECRET;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.error(
        `[quarantine] GET ${url} returned ${response.status} ${response.statusText}`,
      );
      return null;
    }
    const body = (await response.json()) as { tests?: QuarantineEntry[] };
    return body.tests ?? [];
  } catch (error) {
    console.error(`[quarantine] failed to fetch ${url}`, error);
    return null;
  }
}

/** Print the verdict and, outside dry run, set the exit code accordingly. */
function finish(shouldFail: boolean, reason: string): void {
  const verdict = shouldFail ? "FAIL" : "PASS";
  const mode = isDryRun ? " (dry run — not enforced)" : "";
  console.log(`[quarantine] verdict: ${verdict}${mode} — ${reason}.`);
  if (shouldFail && !isDryRun) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const failed = readFailedTests(failuresFile);

  if (failed.length === 0) {
    console.log("[quarantine] no failed tests; passing.");
    return;
  }

  const quarantine = await fetchQuarantine();
  if (quarantine === null) {
    // We couldn't read the list, so we can't confirm everything is
    // quarantined — that's a failing verdict (enforced only outside dry run).
    finish(true, "could not fetch the quarantine list");
    return;
  }

  const { quarantined, unquarantined } = compareFailedToQuarantine(
    failed,
    quarantine,
  );

  console.log(
    `[quarantine] ${failed.length} failed test(s); ${quarantine.length} test(s) in the ${TEST_SUITE} quarantine list.`,
  );
  const describe = (test: FailedTest) =>
    `${test.test_name}  (${test.file_path ?? "unknown file"})`;
  quarantined.forEach((test) =>
    console.log(`  🔒 quarantined: ${describe(test)}`),
  );
  unquarantined.forEach((test) =>
    console.log(`  🚨 NOT quarantined: ${describe(test)}`),
  );

  finish(
    unquarantined.length > 0,
    unquarantined.length > 0
      ? `${unquarantined.length} failed test(s) are not quarantined`
      : "every failed test is quarantined",
  );
}

// Only run when invoked directly (`bun check-quarantine.ts`), not on import.
if (import.meta.main) {
  await main();
}
