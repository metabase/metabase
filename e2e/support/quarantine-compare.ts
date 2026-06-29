// Pure comparison logic for the quarantine gate (DEV-2082), split out from the
// `check-quarantine.ts` executable so it can be unit tested without the script's
// CLI side effects (`import.meta.main`, env reads, `fetch`).

import _ from "underscore";

/** One quarantined test as served by ci-conductor's `/api/quarantine`. */
export type QuarantineEntry = {
  test_name: string;
  test_suite: string;
  test_path: string;
  file_path: string;
};

/** A test that ultimately failed in this run, as recorded by after:spec. */
export type FailedTest = {
  test_name: string;
  test_path: string | null;
  file_path: string | null;
};

/**
 * Identity key for a test: the spec file path, describe path, and leaf test
 * name as a JSON tuple. ci-conductor's quarantine list and our after:spec
 * recorder both derive these three fields from the same Cypress title array
 * (file_path = `spec.relative`, test_path = the joined `describe` titles), so
 * they match exactly. JSON-encoding keeps the parts distinct, so tuples that
 * differ only in where a boundary falls can't collide.
 */
export function matchKey(
  filePath: string | null | undefined,
  testPath: string | null | undefined,
  testName: string,
): string {
  return JSON.stringify([filePath ?? "", testPath ?? "", testName]);
}

/**
 * Partition the run's failed tests into those that are quarantined and those
 * that are not, matching on exact {file_path, test_path, test_name} identity.
 * A single pass over the failures, so the gate doesn't repeat the (potentially
 * large) comparison when it later logs or counts each bucket.
 */
export function compareFailedToQuarantine(
  failedTests: FailedTest[],
  quarantineEntries: QuarantineEntry[],
): { quarantined: FailedTest[]; unquarantined: FailedTest[] } {
  const quarantinedKeys = new Set(
    quarantineEntries.map((q) =>
      matchKey(q.file_path, q.test_path, q.test_name),
    ),
  );
  const [quarantined, unquarantined] = _.partition(failedTests, (test) =>
    quarantinedKeys.has(
      matchKey(test.file_path, test.test_path, test.test_name),
    ),
  );
  return { quarantined, unquarantined };
}
