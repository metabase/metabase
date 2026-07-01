#!/usr/bin/env bun

// Quarantine gate (DEV-2082) — e2e entrypoint. After an e2e job runs, compare the
// tests that *ultimately failed* against ci-conductor's quarantine list and
// decide whether the job should pass: pass iff every failure is quarantined.
//
// The shared gate engine (fetch + compare + verdict + logging) lives in the
// ci-conductor module and is the same one the backend/frontend gates use; this
// file only owns the e2e-specific source of failures. They come from the file
// after:spec writes (`recordFailedTestsForQuarantine` in ci_conductor.ts) — both
// that recording and ci-conductor's quarantine list derive {test_name,
// test_path, file_path} from the same Cypress title array, so the match is exact.
//
// Runs in DRY-RUN by default: it prints a verdict but always exits 0, so it can
// be observed in CI without affecting outcomes. Flip QUARANTINE_DRY_RUN=false to
// enforce.

import { readFileSync } from "node:fs";

import { type FailedTest, applyQuarantineGate } from "./quarantine.ts";
import { log } from "./util.ts";

const {
  CI_CONDUCTOR_BASE_URL,
  CI_CONDUCTOR_WEBHOOK_SECRET,
  CI_CONDUCTOR_TEST_SUITE,
  // Default to a dry run: compute and print the verdict, but never fail the job.
  QUARANTINE_DRY_RUN,
  QUARANTINE_FAILURES_FILE,
} = process.env;

const isDryRun = QUARANTINE_DRY_RUN !== "false";

// ci-conductor keys its quarantine list by suite; e2e reports under "e2e".
const TEST_SUITE = CI_CONDUCTOR_TEST_SUITE || "e2e";

const failuresFile =
  QUARANTINE_FAILURES_FILE ?? "./target/quarantine-failures.jsonl";

/** Read the run's ultimate failures from the JSONL file after:spec appended. */
function readFailedTests(file: string): FailedTest[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    log(`no failures file at ${file}; nothing to gate.`);
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
        log(`skipping unparseable line: ${line}`);
        return null;
      }
    })
    .filter((test): test is FailedTest => test !== null);
}

async function main(): Promise<void> {
  await applyQuarantineGate({
    suite: TEST_SUITE,
    failures: readFailedTests(failuresFile),
    baseUrl: CI_CONDUCTOR_BASE_URL,
    secret: CI_CONDUCTOR_WEBHOOK_SECRET,
    dryRun: isDryRun,
  });
}

// Only run when invoked directly (`bun src/check-e2e-quarantine.ts`), not on import.
if (import.meta.main) {
  main().catch((error) => {
    // Last line of defense: the gate must never throw into the job.
    console.error("[ci-conductor] e2e quarantine gate failed (ignored)", error);
  });
}
