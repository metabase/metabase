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
} = process.env;

// When set, the payload is logged instead of POSTed — used to validate env
// resolution and payload shape in CI before sending real data. See DEV-1999.
const isDryRun = CI_CONDUCTOR_DRY_RUN === "true";

/** Matches the `tests[]` shape consumed by ci-conductor's `ingestFailedTests`. */
type ConductorTest = {
  name: string;
  class?: string;
  file?: string;
  duration?: number;
  /** Raw per-attempt shape from Cypress, e.g. [{state:"failed"},{state:"passed"}]. */
  attempts?: { state: string }[];
  /**
   * Cypress' final `displayError` blob for the test. Null for flaky tests
   * (Cypress drops it when the final attempt passes); only broken tests carry a
   * value. Conductor schema isn't final — fields it doesn't store are ignored.
   */
  message?: string | null;
};

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
 * Pull the reportable tests out of a single spec's run results. We include any
 * test that had at least one failed attempt — so both "broken" (every attempt
 * failed) and "flaky" (failed at least once, passed on retry) are reported.
 * Healthy tests (no failed attempts) are omitted. Conductor classifies the
 * row from the raw `attempts` array.
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

  const tests = (results?.tests ?? [])
    .filter((test) =>
      (test.attempts ?? []).some((attempt) => attempt.state === "failed"),
    )
    .map((test) => {
      const titlePath = test.title ?? [];
      const name = titlePath[titlePath.length - 1] ?? "(unknown test)";
      const suite = titlePath.slice(0, -1).join(" > ");
      return {
        name,
        class: suite || undefined,
        file,
        duration: test.duration,
        attempts: test.attempts ?? [],
        message: test.displayError ?? null,
      };
    });

  if (tests.length === 0 && results?.error) {
    return [
      {
        name: spec?.name ?? "(spec failed to run)",
        file,
        attempts: [{ state: "failed" }],
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
      run_attempt: toNumber(GITHUB_RUN_ATTEMPT),
      job_id: getJobId(),
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
