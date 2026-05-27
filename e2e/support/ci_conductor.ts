import fetch from "node-fetch"; // must be node-fetch v2 because it's non-esm

// `Cypress` and `CypressCommandLine` are global namespaces provided by the
// "cypress" types (see e2e/tsconfig.json), so they're referenced without import.

/**
 * Reports Cypress test failures to the ci-conductor service, mid-run, from the
 * `after:spec` Node hook (see e2e/support/config.js). Sending per-spec — rather
 * than waiting for the whole job to finish — lets failures be tied back to the
 * CI run (and through it the PR / release branch) before the job completes.
 *
 * The URL is only supplied via env in CI, so local runs no-op.
 *
 * See DEV-1999.
 */

const {
  CI_CONDUCTOR_WEBHOOK_URL,
  CI_CONDUCTOR_DRY_RUN,
  REPO_ID,
  GITHUB_RUN_ID,
} = process.env;

// When set, the payload is logged instead of POSTed — used to validate env
// resolution and payload shape in CI before sending real data. See DEV-1999.
const isDryRun = CI_CONDUCTOR_DRY_RUN === "true";

/** Matches the `tests[]` shape consumed by ci-conductor's `ingestFailedTests`. */
type ConductorTest = {
  name: string;
  class?: string;
  file?: string;
  message?: string;
  stack?: string;
};

/**
 * The conductor's `failed_tests.job_id` is a GitHub *numeric* workflow-job id.
 * That number isn't exposed to a running job and isn't static across runs, so
 * for now we send `null` (the column is nullable, and `run_id` already ties a
 * failure to its PR/branch). Kept as a single seam so we can later return a
 * resolved id — or a job name, if the schema changes to accept one — without
 * reshaping the payload. See DEV-1999.
 */
function getJobId(): number | null {
  return null;
}

/** Parse a numeric env var, treating missing/blank/non-numeric as null. */
function toNumber(value: string | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstLine(text: string | null | undefined): string | undefined {
  return text?.split("\n").find((line) => line.trim().length > 0);
}

/**
 * Pull the failed tests out of a single spec's run results. Only tests whose
 * final state is "failed" are included, so a test that flaked but passed on
 * retry is not reported.
 *
 * If the spec crashed before any tests ran (e.g. a compile/import error),
 * Cypress reports no failed tests but sets `results.error`; we surface that as
 * a single synthetic entry so the failure isn't lost.
 */
export function extractFailedTests(
  spec: Cypress.Spec,
  results: CypressCommandLine.RunResult,
): ConductorTest[] {
  const file = spec?.relative;

  const failedTests = (results?.tests ?? [])
    .filter((test) => test.state === "failed")
    .map((test) => {
      const titlePath = test.title ?? [];
      const name = titlePath[titlePath.length - 1] ?? "(unknown test)";
      const suite = titlePath.slice(0, -1).join(" > ");
      const displayError = test.displayError ?? undefined;
      return {
        name,
        class: suite || undefined,
        file,
        message: firstLine(displayError),
        stack: displayError,
      };
    });

  if (failedTests.length === 0 && results?.error) {
    return [
      {
        name: spec?.name ?? "(spec failed to run)",
        file,
        message: firstLine(results.error),
        stack: results.error,
      },
    ];
  }

  return failedTests;
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
      job_id: getJobId(),
      tests,
    };

    if (isDryRun) {
      console.log(
        `[ci-conductor] (dry run) would POST ${tests.length} failure(s):`,
        JSON.stringify(body),
      );
      return;
    }

    const response = await fetch(CI_CONDUCTOR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
