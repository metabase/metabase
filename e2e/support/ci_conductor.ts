import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

import fetch from "node-fetch"; // must be node-fetch v2 because it's non-esm

// The canonical wire shape and the numeric-env parser live once in the
// ci-conductor module (release/ci-conductor), shared by the backend and
// frontend reporters. e2e reuses them so the report path and the quarantine
// path can't drift on a test's identity (see contract.ts). The transport stays
// forked here: e2e posts mid-run from inside Cypress's `after:spec` hook on
// node-fetch, with screenshots and a dry-run mode — none of which the module's
// bun-native, post-run transport covers.
import type {
  FailedTestsBody,
  NormalizedTest,
} from "../../release/ci-conductor/src/contract";
import { toNumber } from "../../release/ci-conductor/src/util";

// `Cypress` and `CypressCommandLine` are global namespaces provided by the
// "cypress" types (see e2e/tsconfig.json), so they're referenced without import.

/**
 * Reports Cypress test failures to the ci-conductor service, mid-run, from the
 * `after:spec` Node hook (see e2e/support/config.js). Sending per-spec — rather
 * than waiting for the whole job to finish — lets failures be tied back to the
 * CI run (and through it the PR / release branch) before the job completes.
 *
 * The base URL is only supplied via env in CI, so local runs no-op.
 *
 * See DEV-1999.
 */

const {
  CI_CONDUCTOR_BASE_URL,
  CI_CONDUCTOR_WEBHOOK_SECRET,
  CI_CONDUCTOR_DRY_RUN,
  REPO_ID,
  GITHUB_RUN_ID,
  GITHUB_RUN_ATTEMPT,
  JOB_ID,
  // The commit and PR target branch under test. On PRs the ambient GITHUB_SHA is
  // a synthetic merge commit and GITHUB_BASE_REF the target, so e2e-test.yml sets
  // COMMIT_SHA/TARGET_BRANCH to the PR's head sha / base ref; we fall back to the
  // ambient vars (push runs, local) when they're unset. See DEV-1999.
  COMMIT_SHA,
  GITHUB_SHA,
  TARGET_BRANCH,
  GITHUB_BASE_REF,
} = process.env;

// When set, the payload is logged instead of POSTed — used to validate env
// resolution and payload shape in CI before sending real data. See DEV-1999.
const isDryRun = CI_CONDUCTOR_DRY_RUN === "true";

/**
 * One reportable e2e test: the shared `NormalizedTest` wire shape (defined once
 * in the ci-conductor module, so the report path and the quarantine path can't
 * drift on a test's identity) plus a transient, never-sent `screenshotPath`.
 *
 * The Cypress-specific field semantics live at `extractFailedTests`: `message`
 * is null for flakes (Cypress drops `displayError` once the final attempt
 * passes), passing tests are only reported on re-runs, and `status` is derived
 * from `attempts` by `classifyStatus`.
 */
type E2ETest = NormalizedTest & {
  /**
   * Transient (never sent on the wire): absolute path to the resolved first
   * failure screenshot, set by `extractFailedTests`. It's read and encoded into
   * `failure_screenshot` just before the POST, then dropped. See DEV-2000.
   */
  screenshotPath?: string;
};

/**
 * Classify a test from its attempts: "passed" if every attempt passed,
 * "failure" if every attempt failed, "flake" if it failed at least once but
 * ultimately passed on retry. Callers only pass tests that ran (a non-empty
 * attempts array of passes and/or fails), never pending/skipped.
 */
function classifyStatus(
  attempts: { state: string }[],
): "failure" | "flake" | "passed" {
  if (attempts.every((attempt) => attempt.state === "passed")) {
    return "passed";
  }
  const allFailed = attempts.every((attempt) => attempt.state === "failed");
  return allFailed ? "failure" : "flake";
}

/**
 * GitHub doesn't expose the current job's numeric `workflow_jobs.id` to a
 * running job, so the `./.github/actions/resolve-job-id` composite action
 * resolves it once at job start and exports it as `JOB_ID`. We just read that
 * env here. Falls back to null when the env isn't set (the column is
 * nullable). See DEV-1999.
 */
function getJobId(): number | null {
  return toNumber(JOB_ID);
}

/** Normalize a string to just [a-z0-9] for sanitization-proof matching. */
function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Basename of a path, tolerant of both POSIX and Windows separators. */
function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? "";
}

/**
 * Match a failed test to its first-failure screenshot from after:spec's
 * `results.screenshots` — a flat, spec-level list with no link back to the test.
 * Cypress derives each screenshot filename from the test's full title (joined
 * with " -- ", sanitized) followed by " (failed)" (plus "(attempt N)" for
 * retries). We normalize the title and each basename down to [a-z0-9] — which
 * cancels every sanitization rule (">", " -- ", "/", ":", ...) on both sides, so
 * we never reconstruct the filename — and anchor on the title immediately
 * followed by "failed":
 *
 *   normalize(basename) === normalize(title.join("")) + "failed" + [attempt…] + ext
 *
 * Anchoring on "failed" (a) excludes manual cy.screenshot() shots, which have no
 * "(failed)" suffix, and (b) is collision-proof: a title that's a prefix of
 * another's won't match, because "failed" must follow the key exactly. The first
 * shot and its retries both anchor-match, so we take the shortest basename — the
 * one without an "(attempt N)" suffix, i.e. the first attempt.
 *
 * Pure and defensive: returns undefined on any missing/odd input, never throws.
 * See DEV-2000.
 */
export function resolveScreenshotPath(
  titlePath: string[] | undefined,
  screenshots: Array<{ path?: string }> | undefined,
): string | undefined {
  try {
    const key = normalizeForMatch((titlePath ?? []).join(""));
    if (!key || !Array.isArray(screenshots)) {
      return undefined;
    }

    const anchor = `${key}failed`;
    return (
      screenshots
        .map((shot) => (typeof shot?.path === "string" ? shot.path : ""))
        .filter((path) => path !== "")
        .filter((path) => normalizeForMatch(baseName(path)).startsWith(anchor))
        // Shortest basename = the first attempt (no "(attempt N)" suffix).
        .sort((a, b) => baseName(a).length - baseName(b).length)[0]
    );
  } catch (error) {
    console.error("[ci-conductor] failed to resolve screenshot path", error);
    return undefined;
  }
}

// ci-conductor rejects screenshots over 10 MB decoded; base64 inflates ~33%, so
// we cap the raw file well under that (see its lib/screenshots MAX_SCREENSHOT_BYTES).
const MAX_SCREENSHOT_RAW_BYTES = 7 * 1024 * 1024;

/**
 * Read a screenshot file and return it as a base64 PNG data URI, or undefined if
 * the file is missing, empty, too large, or unreadable. Best-effort and never
 * throws — a screenshot problem must not break reporting. See DEV-2000.
 */
function encodeScreenshot(filePath: string): string | undefined {
  try {
    const stat = statSync(filePath);
    if (
      !stat.isFile() ||
      stat.size === 0 ||
      stat.size > MAX_SCREENSHOT_RAW_BYTES
    ) {
      return undefined;
    }
    const b64 = readFileSync(filePath).toString("base64");
    return b64 ? `data:image/png;base64,${b64}` : undefined;
  } catch (error) {
    console.error("[ci-conductor] failed to read screenshot", filePath, error);
    return undefined;
  }
}

/**
 * Pull the reportable tests out of a single spec's run results. We always
 * include any test that had at least one failed attempt — so both "broken"
 * (every attempt failed) and "flaky" (failed at least once, passed on retry)
 * are reported. On a re-run (GITHUB_RUN_ATTEMPT > 1) we additionally include
 * tests that passed, so conductor can see a previously-failing test recover.
 * Pending/skipped tests are never reported. Each row carries a derived `status`
 * ("failure" | "flake" | "passed"); see `classifyStatus`.
 *
 * Cypress only populates `displayError` for the *final* state, so flaky tests
 * arrive with `message: null` — we know *that* they flaked from `attempts`,
 * but not *why*. Broken tests carry the full error blob.
 *
 * If the spec crashed before any tests ran (e.g. a compile/import error),
 * Cypress reports no tests but sets `results.error`; we surface that as a
 * single synthetic entry so the failure isn't lost.
 */
export function extractFailedTests(
  spec: Cypress.Spec,
  results: CypressCommandLine.RunResult,
): E2ETest[] {
  const file = spec?.relative;

  // On a re-run we also report passing tests (not just failures) so conductor
  // can see a previously-failing test recover. Read at call time rather than the
  // module-level destructure so it's controllable per-call in tests.
  const isRerun = (toNumber(process.env.GITHUB_RUN_ATTEMPT) ?? 0) > 1;

  const tests = (results?.tests ?? [])
    .filter((test) => {
      const attempts = test.attempts ?? [];
      const failed = attempts.some((attempt) => attempt.state === "failed");
      // A test "passed" only if it ran and every attempt passed — this excludes
      // pending/skipped tests, which we never report.
      const passed =
        attempts.length > 0 &&
        attempts.every((attempt) => attempt.state === "passed");
      return failed || (isRerun && passed);
    })
    .map((test) => {
      const titlePath = test.title ?? [];
      const name = titlePath[titlePath.length - 1] ?? "(unknown test)";
      const suite = titlePath.slice(0, -1).join(" > ");
      const attempts = test.attempts ?? [];
      // Resolve (but don't yet read) the test's first failure screenshot from
      // this spec's `results.screenshots`. The file is encoded into
      // `failure_screenshot` at send time so the matching logic here stays pure.
      // Returns undefined on any miss — best-effort.
      const screenshotPath = resolveScreenshotPath(
        titlePath,
        results?.screenshots,
      );
      return {
        name,
        path: suite || undefined,
        file,
        duration: test.duration,
        attempts,
        status: classifyStatus(attempts),
        message: test.displayError ?? null,
        ...(screenshotPath ? { screenshotPath } : {}),
      };
    });

  if (tests.length === 0 && results?.error) {
    return [
      {
        name: spec?.name ?? "(spec failed to run)",
        file,
        attempts: [{ state: "failed" }],
        status: "failure",
        message: results.error,
      },
    ];
  }

  return tests;
}

/**
 * Where after:spec records this run's ultimate test failures for the post-run
 * quarantine gate (DEV-2082). One JSON object per line
 * (`{test_name, test_path, file_path}`), appended per spec, so the gate step
 * can read the whole job's failures from a single file. Override with
 * QUARANTINE_FAILURES_FILE. Note these are the SAME fields ci-conductor stores
 * in its quarantine list (both derived from the same Cypress title array), so
 * the gate can compare them exactly. See `check-quarantine.ts`.
 */
const QUARANTINE_FAILURES_FILE =
  process.env.QUARANTINE_FAILURES_FILE ?? "./target/quarantine-failures.jsonl";

/**
 * Persist the tests that ultimately failed (status "failure") so the post-run
 * quarantine gate can decide whether the job passes. Flaky tests that recovered
 * on retry and passing tests don't gate the build, so they're filtered out.
 * Best-effort and never throws — recording must not break the test run.
 */
export function recordFailedTestsForQuarantine(tests: E2ETest[]): void {
  try {
    const broken = tests.filter((test) => test.status === "failure");
    if (broken.length === 0) {
      return;
    }
    const lines =
      broken
        .map((test) =>
          JSON.stringify({
            test_name: test.name,
            test_path: test.path ?? null,
            file_path: test.file ?? null,
          }),
        )
        .join("\n") + "\n";
    mkdirSync(dirname(QUARANTINE_FAILURES_FILE), { recursive: true });
    appendFileSync(QUARANTINE_FAILURES_FILE, lines);
  } catch (error) {
    console.error("[quarantine] failed to record failures", error);
  }
}

/**
 * Report the given failures to ci-conductor. In dry-run mode the payload is
 * logged and nothing is sent. Otherwise it's POSTed, no-opping when the webhook
 * URL isn't configured (local runs, PRs without the secret). Never throws —
 * reporting must not break a test run — so all errors are logged and swallowed.
 */
export async function reportFailedTestsToConductor(
  tests: E2ETest[],
): Promise<void> {
  if (tests.length === 0 || (!CI_CONDUCTOR_BASE_URL && !isDryRun)) {
    return;
  }

  // Everything below is wrapped so the reporter can never throw into the test
  // run, regardless of payload contents or network behavior.
  try {
    // Best-effort: read each resolved screenshot and inline it as base64 for
    // ci-conductor to upload. encodeScreenshot never throws — a test simply goes
    // without a screenshot if it can't be read. The transient `screenshotPath`
    // is dropped here so it never reaches the wire.
    const outgoing = tests.map(({ screenshotPath, ...rest }) => {
      const failure_screenshot = screenshotPath
        ? encodeScreenshot(screenshotPath)
        : undefined;
      return failure_screenshot ? { ...rest, failure_screenshot } : rest;
    });

    // Typed against the shared contract so the run-level identity stays in
    // lockstep with the backend/frontend reporters; `retries` is the one e2e-only
    // field (Cypress has a retry ceiling; the JUnit producers don't).
    const body: FailedTestsBody & { retries: number | null } = {
      repo_id: toNumber(REPO_ID),
      run_id: toNumber(GITHUB_RUN_ID),
      attempt: toNumber(GITHUB_RUN_ATTEMPT),
      job_id: getJobId(),
      test_suite: "e2e",
      // PR head sha / target branch when set by e2e-test.yml, else the ambient
      // (push/local) values. Empty strings collapse to null.
      sha: COMMIT_SHA || GITHUB_SHA || null,
      target_branch: TARGET_BRANCH || GITHUB_BASE_REF || null,
      // The retry ceiling so conductor can interpret per-test `attempts`.
      // CYPRESS_RETRIES isn't set in CI by default; e2e/support/config.js
      // surfaces the resolved Cypress config value into this env at startup.
      retries: toNumber(process.env.CYPRESS_RETRIES),
      tests: outgoing,
    };

    if (isDryRun) {
      // Don't dump base64 blobs into the log — replace each with a size marker.
      const screenshotCount = outgoing.filter(
        (t) => t.failure_screenshot,
      ).length;
      const redactedTests = outgoing.map((t) =>
        t.failure_screenshot
          ? {
              ...t,
              failure_screenshot: `<base64 ${t.failure_screenshot.length} chars>`,
            }
          : t,
      );
      console.log(
        `[ci-conductor] (dry run) would POST ${outgoing.length} failure(s), ${screenshotCount} with screenshot(s):`,
        JSON.stringify({ ...body, tests: redactedTests }),
      );
      return;
    }

    if (!CI_CONDUCTOR_BASE_URL) {
      // already excluded by the guard above; this also narrows the type
      return;
    }

    // CI_CONDUCTOR_BASE_URL holds the ci-conductor base origin (e.g.
    // "https://conductor.<host>"); we append this endpoint's path. Other
    // consumers (e.g. the quarantine gate's /api/quarantine) build their own.
    const endpoint = `${CI_CONDUCTOR_BASE_URL.replace(/\/+$/, "")}/webhooks/failed-tests`;

    // ci-conductor authenticates this endpoint via the x-internal-secret header.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (CI_CONDUCTOR_WEBHOOK_SECRET) {
      headers["x-internal-secret"] = CI_CONDUCTOR_WEBHOOK_SECRET;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(
        `[ci-conductor] failed-tests POST returned ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("[ci-conductor] failed to POST failed-tests", error);
  }
}
