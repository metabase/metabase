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

const {
  CI_CONDUCTOR_WEBHOOK_URL,
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
  process.argv[2] ??
  QUARANTINE_FAILURES_FILE ??
  "./target/quarantine-failures.jsonl";

/** One quarantined test as served by ci-conductor's `/api/quarantine`. */
type QuarantineEntry = {
  test_name: string;
  test_suite: string;
  test_path: string;
  file_path: string;
};

/** A test that ultimately failed in this run, as recorded by after:spec. */
type FailedTest = {
  test_name: string;
  test_path: string | null;
  file_path: string | null;
};

/** Basename of a path, tolerant of both POSIX and Windows separators. */
function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? "";
}

/**
 * Identity key for a test. ci-conductor's quarantine list and our after:spec
 * recorder both derive these fields from the same Cypress title array, so an
 * exact comparison is sound. We key on the spec basename (robust to any
 * path-prefix difference), the describe path, and the leaf test name.
 */
function matchKey(
  filePath: string | null | undefined,
  testPath: string | null | undefined,
  testName: string,
): string {
  return [
    filePath ? baseName(filePath) : "",
    (testPath ?? "").trim(),
    testName.trim(),
    // NUL separator: can't appear in any of the parts, so no collisions.
  ].join("\u0000");
}

/** Read and de-dupe the run's failed tests from the JSONL file. */
function readFailedTests(file: string): FailedTest[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    console.log(`[quarantine] no failures file at ${file}; nothing to gate.`);
    return [];
  }

  const parsed = raw
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

  const seen = new Set<string>();
  return parsed.filter((test) => {
    const key = matchKey(test.file_path, test.test_path, test.test_name);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Resolve the ci-conductor API base from the webhook URL secret. That secret
 * holds the webhooks base (".../webhooks"); the quarantine list lives at
 * ".../api/quarantine" on the same host, so we drop the "/webhooks" suffix.
 */
function quarantineUrl(): string | null {
  if (!CI_CONDUCTOR_WEBHOOK_URL) {
    return null;
  }
  const base = CI_CONDUCTOR_WEBHOOK_URL.replace(/\/+$/, "").replace(
    /\/webhooks$/,
    "",
  );
  return `${base}/api/quarantine?suite=${TEST_SUITE}`;
}

/** Fetch the quarantine list, or null if it can't be retrieved. */
async function fetchQuarantine(): Promise<QuarantineEntry[] | null> {
  const url = quarantineUrl();
  if (!url) {
    console.log(
      "[quarantine] CI_CONDUCTOR_WEBHOOK_URL is unset; cannot fetch the quarantine list.",
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

  const quarantined = new Set(
    quarantine.map((q) => matchKey(q.file_path, q.test_path, q.test_name)),
  );

  const unquarantined = failed.filter(
    (test) =>
      !quarantined.has(
        matchKey(test.file_path, test.test_path, test.test_name),
      ),
  );

  console.log(
    `[quarantine] ${failed.length} failed test(s); ${quarantine.length} test(s) in the ${TEST_SUITE} quarantine list.`,
  );
  failed.forEach((test) => {
    const isQuarantined = quarantined.has(
      matchKey(test.file_path, test.test_path, test.test_name),
    );
    console.log(
      `  ${isQuarantined ? "✓ quarantined" : "✗ NOT quarantined"}: ${test.test_name}  (${test.file_path ?? "unknown file"})`,
    );
  });

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
