// Shared quarantine gate for all three suites: given a run's failed tests, pass
// iff every failure is on ci-conductor's quarantine list.

import type { NormalizedTest } from "./contract.ts";
import { log } from "./util.ts";

// The list endpoint can be slow, but the gate must never hang a CI job.
const REQUEST_TIMEOUT_MS = 15_000;

/** One quarantined test as served by ci-conductor's `/api/quarantine`. */
export type QuarantineEntry = {
  test_name: string;
  test_suite: string;
  test_path: string;
  file_path: string;
};

/**
 * A test that ultimately failed in this run. The three identity fields mirror
 * ci-conductor's wire/storage names (`NormalizedTest`'s `name`/`path`/`file`
 * map to `test_name`/`test_path`/`file_path`); `junitFailuresToFailedTests`
 * does that rename for the JUnit suites.
 */
export type FailedTest = {
  test_name: string;
  test_path: string | null;
  file_path: string | null;
};

/** The gate's outcome. `enforced` is the raw verdict gated by dry-run. */
export type GateResult = {
  /** True when any failure isn't quarantined (or the list couldn't be read). */
  shouldFail: boolean;
  /** `shouldFail` AND not a dry run — i.e. the entrypoint should exit non-zero. */
  enforced: boolean;
  reason: string;
};

/**
 * Identity key for a test: the spec/source file, the describe/namespace path,
 * and the leaf test name as a JSON tuple. JSON-encoding keeps the parts
 * distinct, so tuples that differ only in where a boundary falls (`["a","b"]`
 * vs `["ab",""]`) can't collide.
 */
export function matchKey(opts: {
  filePath: string | null | undefined;
  testPath: string | null | undefined;
  testName: string;
}): string {
  const { filePath, testPath, testName } = opts;
  return JSON.stringify([filePath ?? "", testPath ?? "", testName]);
}

/**
 * Partition the run's failed tests into those that are quarantined and those
 * that are not, matching on exact {file_path, test_path, test_name} identity.
 * A single pass over the failures.
 */
export function compareFailedToQuarantine(
  failedTests: FailedTest[],
  quarantineEntries: QuarantineEntry[],
): { quarantined: FailedTest[]; unquarantined: FailedTest[] } {
  const quarantinedKeys = new Set(
    quarantineEntries.map((q) =>
      matchKey({
        filePath: q.file_path,
        testPath: q.test_path,
        testName: q.test_name,
      }),
    ),
  );
  const quarantined: FailedTest[] = [];
  const unquarantined: FailedTest[] = [];
  for (const test of failedTests) {
    const isQuarantined = quarantinedKeys.has(
      matchKey({
        filePath: test.file_path,
        testPath: test.test_path,
        testName: test.test_name,
      }),
    );
    (isQuarantined ? quarantined : unquarantined).push(test);
  }
  return { quarantined, unquarantined };
}

/**
 * Adapt the JUnit suites' normalized failures to the gate's `FailedTest` shape.
 * `parseJunit` only emits failing/erroring testcases, but we filter on `status`
 * defensively so a future "passed" row can't leak into the gate.
 */
export function junitFailuresToFailedTests(
  tests: NormalizedTest[],
): FailedTest[] {
  return tests
    .filter((test) => (test.status ?? "failure") === "failure")
    .map((test) => ({
      test_name: test.name,
      test_path: test.path ?? null,
      file_path: test.file ?? null,
    }));
}

/**
 * Fetch the quarantine list for `suite` from ci-conductor. The reporter POSTs to
 * `.../webhooks/failed-tests`; the list lives at `.../api/quarantine` on the same
 * host. Returns null (not []) when it can't be retrieved, so the caller can tell
 * "nothing quarantined" from "couldn't check". Never throws. Logs the path and
 * suite only — never the host (public repo) or the secret.
 */
export async function fetchQuarantineList(opts: {
  baseUrl: string;
  suite: string;
  secret?: string;
}): Promise<QuarantineEntry[] | null> {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const url = `${base}/api/quarantine?suite=${encodeURIComponent(opts.suite)}`;
  try {
    const headers: Record<string, string> = {};
    if (opts.secret) {
      headers["x-internal-secret"] = opts.secret;
    }
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      log(
        `🛑 GET /api/quarantine?suite=${opts.suite} → ${response.status} ${response.statusText}`,
      );
      return null;
    }
    const body = (await response.json()) as { tests?: QuarantineEntry[] };
    return body.tests ?? [];
  } catch (error) {
    console.error(
      "[ci-conductor] failed to fetch the quarantine list",
      error,
    );
    return null;
  }
}

const RULE = "─".repeat(60);

/** `test_path › test_name`, or just the name when there's no path. */
function title(test: FailedTest): string {
  return test.test_path ? `${test.test_path} › ${test.test_name}` : test.test_name;
}

/** Print the verdict (+ dry-run footer) and return the gate result. */
function finish(opts: {
  shouldFail: boolean;
  reason: string;
  dryRun: boolean;
  // When the gate couldn't reach a real pass/fail decision — e.g. the quarantine
  // list was unreachable — show a distinct "couldn't check" verdict rather than a
  // red FAIL. It still fails closed (shouldFail stays true), but it isn't a real
  // gate failure, so it shouldn't read as one in the logs.
  inconclusive?: boolean;
}): GateResult {
  const { shouldFail, reason, dryRun, inconclusive = false } = opts;
  if (inconclusive) {
    log(`⚠️  VERDICT: COULD NOT CHECK — ${reason}.`);
  } else if (shouldFail) {
    log(`🔴 VERDICT: FAIL — ${reason}.`);
  } else {
    log(`🟢 VERDICT: PASS — ${reason}.`);
  }
  if (dryRun && shouldFail) {
    log("🌥️  dry run: not enforced — exiting 0.");
  }
  log(RULE);
  return { shouldFail, enforced: shouldFail && !dryRun, reason };
}

/**
 * Check one suite's failures against the quarantine gate: print a readable,
 * dry-run-aware report of which failures are quarantined and return the verdict.
 * Pure w.r.t. process state — it computes and returns a `GateResult` but never
 * touches the exit code; `applyQuarantineGate` is the adapter that enacts it.
 * Source-agnostic — each suite's entrypoint resolves its own `failures` and
 * `suite`. Never throws.
 */
export async function checkQuarantineGate(opts: {
  suite: string;
  failures: FailedTest[];
  baseUrl: string | undefined;
  secret: string | undefined;
  dryRun: boolean;
}): Promise<GateResult> {
  const { suite, failures, baseUrl, secret, dryRun } = opts;

  log(RULE);
  log(`🛡️  CI Conductor quarantine gate · suite "${suite}"`);
  log(
    dryRun
      ? "🌥️  DRY RUN — observing only; this gate never fails the job."
      : "⚔️  ENFORCING — an unquarantined failure will fail this job.",
  );
  log(RULE);

  if (failures.length === 0) {
    log("✅ no failures this run — nothing to gate.");
    log(RULE);
    return { shouldFail: false, enforced: false, reason: "no failures to gate" };
  }

  if (!baseUrl) {
    log("⚠️  CI_CONDUCTOR_BASE_URL not set — can't fetch the quarantine list (local run or missing secret).");
    return finish({
      shouldFail: true,
      reason: "could not fetch the quarantine list",
      dryRun,
      inconclusive: true,
    });
  }

  const list = await fetchQuarantineList({ baseUrl, suite, secret });
  if (list === null) {
    // Couldn't read the list ⇒ can't confirm everything is quarantined.
    return finish({
      shouldFail: true,
      reason: "could not fetch the quarantine list",
      dryRun,
      inconclusive: true,
    });
  }

  const { quarantined, unquarantined } = compareFailedToQuarantine(failures, list);

  log(`📋 quarantine list: ${list.length} test(s) registered for "${suite}"`);
  log(`💥 this run: ${failures.length} failure(s) to evaluate`);
  for (const test of quarantined) {
    log(`  🔒 quarantined      ${title(test)}`);
    log(`                      ↳ ${test.file_path ?? "(no file)"}`);
  }
  for (const test of unquarantined) {
    log(`  🚨 NOT quarantined  ${title(test)}`);
    log(`                      ↳ ${test.file_path ?? "(no file)"}`);
  }

  return finish({
    shouldFail: unquarantined.length > 0,
    reason:
      unquarantined.length > 0
        ? `${unquarantined.length} of ${failures.length} failure(s) are NOT quarantined`
        : `all ${failures.length} failure(s) are quarantined`,
    dryRun,
  });
}

/**
 * Impure adapter over `checkQuarantineGate`: run the check, then apply the
 * verdict to the process exit code (non-zero only when `enforced`). This is the
 * one place the gate touches process state, so the engine stays testable.
 */
export async function applyQuarantineGate(
  opts: Parameters<typeof checkQuarantineGate>[0],
): Promise<void> {
  const result = await checkQuarantineGate(opts);
  if (result.enforced) {
    process.exitCode = 1;
  }
}
