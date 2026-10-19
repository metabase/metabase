// Shared quarantine gate for all three suites: given a run's failed tests, pass
// iff a suite-level rule covers the whole suite, or every failure is on
// ci-conductor's per-test quarantine list.

import type { NormalizedTest } from "./contract.ts";
import { fetchWithRetry } from "./fetchWithRetry.ts";
import { log } from "./util.ts";

// The list endpoint can be slow, but the gate must never hang a CI job.
const REQUEST_TIMEOUT_MS = 15_000;

// A dropped socket (ECONNRESET) or a 5xx is a blip, not a verdict, so the fetch
// gets a few tries before the gate gives up. `fetchWithRetry` spaces those tries
// with jittered exponential backoff, so parallel jobs don't retry in lockstep.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

/** One quarantined test as served by ci-conductor's `/api/quarantine`. */
export type QuarantineEntry = {
  test_name: string;
  test_suite: string;
  test_path: string;
  file_path: string;
  permalink: string;
};

/**
 * What `/api/quarantine` tells a CI job: the individual tests that don't gate,
 * plus the suite-level glob rules. `suites` is served whole regardless of the
 * `?suite=` filter — the job matches its own suite name against the rules.
 */
export type QuarantineList = {
  tests: QuarantineEntry[];
  suites: string[];
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
): { quarantined: QuarantineEntry[]; unquarantined: FailedTest[] } {
  const quarantinedByKeys = new Map(
    quarantineEntries.map((q) =>
      [matchKey({
        filePath: q.file_path,
        testPath: q.test_path,
        testName: q.test_name,
      }), q],
    ),
  );
  const quarantined: QuarantineEntry[] = [];
  const unquarantined: FailedTest[] = [];
  for (const test of failedTests) {
    const quarantineEntry = quarantinedByKeys.get(
      matchKey({
        filePath: test.file_path,
        testPath: test.test_path,
        testName: test.test_name,
      }),
    );
    quarantineEntry ? quarantined.push(quarantineEntry) : unquarantined.push(test);
  }
  return { quarantined, unquarantined };
}

/** Regex-escape a literal glob character. */
function escapeLiteral(char: string): string {
  return /[.+^$()|[\]\\]/.test(char) ? `\\${char}` : char;
}

/**
 * Compile a suite-quarantine glob to a RegExp: `*` is any run, `?` is one
 * character, `{a,b}` is an alternation, everything else is literal, and the
 * whole thing matches UNANCHORED (as a substring) and case-insensitively — so
 * `athena` catches `be-tests-athena-ee` without a trailing `*`.
 *
 * This is a deliberate subset of the minimatch semantics ci-conductor validates
 * globs against (server repo `shared/suiteGlob.ts`), covering everything that
 * makes sense for suite names, which have no path separators. `release/ci-conductor`
 * carries no runtime dependencies and CI runs it straight from the checkout, so
 * pulling in minimatch itself isn't on the table. Brace depth is tracked, so an
 * unbalanced `{` closes itself rather than compiling to an invalid pattern.
 *
 * The pattern is left unanchored because `RegExp.test` already searches anywhere
 * in the string — that IS the substring semantics.
 */
function globToRegExp(glob: string): RegExp {
  let source = "";
  let depth = 0;
  for (const char of glob) {
    if (char === "*") {
      source += ".*";
    } else if (char === "?") {
      source += ".";
    } else if (char === "{") {
      source += "(";
      depth += 1;
    } else if (char === "}" && depth > 0) {
      source += ")";
      depth -= 1;
    } else if (char === "," && depth > 0) {
      source += "|";
    } else {
      source += escapeLiteral(char);
    }
  }
  return new RegExp(source + ")".repeat(depth), "i");
}

/** Does one suite-quarantine glob cover this suite name? */
export function suiteMatchesGlob(suite: string, glob: string): boolean {
  const trimmed = glob.trim();
  // An empty rule would compile to the empty pattern and match every suite.
  return trimmed !== "" && globToRegExp(trimmed).test(suite);
}

/**
 * The first glob rule that quarantines `suite`, or undefined when none does.
 * Returning the rule itself lets the gate name it in the verdict.
 */
export function quarantinedSuiteGlob(
  suite: string,
  globs: string[],
): string | undefined {
  return globs.find((glob) => suiteMatchesGlob(suite, glob));
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
 * host. Transport errors, timeouts, 429s and 5xx are retried with backoff; a 4xx
 * is the request's own fault and returns straight away. Returns null (not an
 * empty list) when it can't be retrieved, so the caller can tell "nothing
 * quarantined" from "couldn't check". Never throws. Logs the path and suite only
 * — never the host (public repo) or the secret. The retry policy is fixed rather
 * than injectable: the tests drive it on fake timers, so there's nothing to
 * shorten for them.
 */
export async function fetchQuarantine(opts: {
  baseUrl: string;
  suite: string;
  secret?: string;
}): Promise<QuarantineList | null> {
  const { baseUrl, suite, secret } = opts;
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/api/quarantine?suite=${encodeURIComponent(suite)}`;
  const headers: Record<string, string> = secret
    ? { "x-internal-secret": secret }
    : {};

  try {
    const response = await fetchWithRetry(url, {
      headers,
      retries: MAX_ATTEMPTS - 1,
      baseDelay: RETRY_BASE_DELAY_MS,
      timeout: REQUEST_TIMEOUT_MS,
      // Called once per completed response, so it doubles as the one place a
      // non-ok status gets logged — including on attempts we then retry.
      shouldRetry: (res) => {
        if (!res.ok) {
          log(
            `🛑 GET /api/quarantine?suite=${suite} → ${res.status} ${res.statusText}`,
          );
        }
        // A 4xx (bad secret, unknown suite) answers the same way every time.
        return res.status >= 500 || res.status === 429;
      },
    });
    if (!response.ok) {
      response.body?.cancel().catch(() => {}); // don't leak the unread stream
      return null;
    }
    // `json()` is `any`; this names the wire shape we read (and only read).
    // Both keys are optional so a server that predates suite-level rules — or
    // one that starts serving them — needs no lockstep deploy with this script.
    const body = (await response.json()) as Partial<QuarantineList>;
    return { tests: body.tests ?? [], suites: body.suites ?? [] };
  } catch (error) {
    console.error("[ci-conductor] failed to fetch the quarantine list", error);
    return null;
  }
}

const RULE = "─".repeat(60);

/** `test_path › test_name`, or just the name when there's no path. */
function title(test: FailedTest): string {
  return test.test_path ? `${test.test_path} › ${test.test_name}` : test.test_name;
}

/**
 * Fallback to building a search link for a given test if we don't have a permalink,
 * expected if this test isn't on the quarantine list. Properly escape all the special
 * characters.
 */
export function testSearchUrl(
  baseUrl: string,
  test: FailedTest | QuarantineEntry,
): string {
  return `${baseUrl.replace(/\/+$/, "")}/tests?${new URLSearchParams({ q: test.test_name })}`;
}

/** Print the verdict (+ dry-run footer) and return the gate result. */
function finish(opts: {
  shouldFail: boolean;
  reason: string;
  dryRun: boolean;
  // When the gate couldn't reach a real pass/fail decision — e.g. the quarantine
  // list was unreachable — show a distinct "couldn't check" verdict rather than a
  // red FAIL. It still fails closed (shouldFail stays true): with no list, nothing
  // excuses the run's failures.
  inconclusive?: boolean;
}): GateResult {
  const { shouldFail, reason, dryRun, inconclusive = false } = opts;
  if (inconclusive) {
    log(`⚠️  VERDICT: COULD NOT CHECK — ${reason}.`);
    log("🚦 no quarantine to apply — the run's failures stand on their own.");
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

  const list = await fetchQuarantine({ baseUrl, suite, secret });
  if (list === null) {
    // Couldn't read the list ⇒ can't confirm everything is quarantined.
    return finish({
      shouldFail: true,
      reason: "could not fetch the quarantine list",
      dryRun,
      inconclusive: true,
    });
  }

  // A suite-level rule quarantines the whole suite, so its failures never gate
  // and there's nothing to compare test by test.
  const suiteGlob = quarantinedSuiteGlob(suite, list.suites);
  if (suiteGlob) {
    log(`🏷️  suite rule "${suiteGlob}" covers this suite — no failure here gates.`);
    return finish({
      shouldFail: false,
      reason: `suite "${suite}" is quarantined by the rule "${suiteGlob}"`,
      dryRun,
    });
  }

  const { quarantined, unquarantined } = compareFailedToQuarantine(
    failures,
    list.tests,
  );

  log(`📋 quarantine list: ${list.tests.length} test(s) registered for "${suite}"`);
  log(`💥 this run: ${failures.length} failure(s) to evaluate`);
  for (const test of quarantined) {
    log(`  🔒 quarantined      ${title(test)}`);
    log(`                      ↳ ${test.file_path ?? "(no file)"}`);
    log(
      `                      ↳ View test in CI Conductor: ${test.permalink || testSearchUrl(baseUrl, test)}`,
    );
  }
  for (const test of unquarantined) {
    log(`  🚨 NOT quarantined  ${title(test)}`);
    log(`                      ↳ ${test.file_path ?? "(no file)"}`); 
    log(
      `                      ↳ View test in CI Conductor: ${testSearchUrl(baseUrl, test)}`,
    );
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
