import fetch from "node-fetch"; // must be node-fetch v2 because it's non-esm

// `Cypress` and `CypressCommandLine` are global namespaces provided by the
// "cypress" types (see e2e/tsconfig.json), so they're referenced without import.

/**
 * Reports Cypress test failures to the ci-conductor service, mid-run, from the
 * `after:spec` Node hook (see e2e/support/config.js). Sending per-spec — rather
 * than waiting for the whole job to finish — lets failures be tied back to the
 * CI run (and through it the PR / release branch) before the job completes.
 *
 * The webhooks base URL is only supplied via env in CI, so local runs no-op.
 *
 * See DEV-1999.
 */

const {
  CI_CONDUCTOR_WEBHOOK_URL,
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

/** Matches the `tests[]` shape consumed by ci-conductor's `ingestFailedTests`. */
type ConductorTest = {
  name: string;
  /** The test's suite path (the joined `describe` titles), formerly `class`. */
  path?: string;
  file?: string;
  duration?: number;
  /** Raw per-attempt shape from Cypress, e.g. [{state:"failed"},{state:"passed"}]. */
  attempts?: { state: string }[];
  /**
   * "failure" when every attempt failed (broken), "flake" when it failed then
   * passed on retry, "passed" when every attempt passed. Passes are only
   * reported on re-runs (run attempt > 1). Derived from `attempts`.
   */
  status?: "failure" | "flake" | "passed";
  /**
   * Cypress' final `displayError` blob for the test. Null for flaky tests
   * (Cypress drops it when the final attempt passes); only broken tests carry a
   * value. Conductor schema isn't final — fields it doesn't store are ignored.
   */
  message?: string | null;
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

/** Parse a numeric env var, treating missing/blank/non-numeric as null. */
function toNumber(value: string | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
): ConductorTest[] {
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
      return {
        name,
        path: suite || undefined,
        file,
        duration: test.duration,
        attempts,
        status: classifyStatus(attempts),
        message: test.displayError ?? null,
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
 * Report the given failures to ci-conductor. In dry-run mode the payload is
 * logged and nothing is sent. Otherwise it's POSTed, no-opping when the webhook
 * URL isn't configured (local runs, PRs without the secret). Never throws —
 * reporting must not break a test run — so all errors are logged and swallowed.
 */
export async function reportFailedTestsToConductor(
  tests: ConductorTest[],
): Promise<void> {
  if (tests.length === 0 || (!CI_CONDUCTOR_WEBHOOK_URL && !isDryRun)) {
    return;
  }

  // Everything below is wrapped so the reporter can never throw into the test
  // run, regardless of payload contents or network behavior.
  try {
    const body = {
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
      tests,
    };

    if (isDryRun) {
      console.log(
        `[ci-conductor] (dry run) would POST ${tests.length} failure(s):`,
        JSON.stringify(body),
      );
      return;
    }

    if (!CI_CONDUCTOR_WEBHOOK_URL) {
      // already excluded by the guard above; this also narrows the type
      return;
    }

    // CI_CONDUCTOR_WEBHOOK_URL holds the webhooks *base* (e.g. ".../webhooks");
    // we append the specific endpoint so the same secret can serve others later.
    const endpoint = `${CI_CONDUCTOR_WEBHOOK_URL.replace(/\/+$/, "")}/failed-tests`;

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
