// Run by each required `*-result` job of "Run tests" when one of its jobs
// failed (.github/actions/flaky-auto-pass-result). Answers whether the run was
// auto-passed as confirmed-flaky: flaky-rerun-auto-pass.ts leaves a marker check
// on the commit, then re-runs only the failed result jobs, and this lets them
// pass. See markerCoverage for what a marker covers.
//
// Writes `passed=true` or `passed=false` to GITHUB_OUTPUT, and never fails the
// step: anything short of a clear yes is `false`, and the result job then fails
// as it always has.

import { appendFileSync } from "node:fs";

import {
  type CheckRun,
  MARKER_CHECK_NAME,
  github,
  latestJobs,
  markerCoverage,
} from "./flaky-rerun-auto-pass";

async function covered(env: NodeJS.ProcessEnv): Promise<string | true> {
  if (env.ENABLE_AUTO_PASS !== "true") {
    return "ENABLE_AUTO_PASS is not 'true'";
  }
  const runId = Number(env.RUN_ID);
  const headSha = env.HEAD_SHA ?? "";
  if (
    !Number.isInteger(runId) ||
    runId <= 0 ||
    !/^[0-9a-f]{40}$/i.test(headSha)
  ) {
    return "no run id or head sha";
  }
  const [checks, jobs] = await Promise.all([
    github(
      `/commits/${headSha}/check-runs?check_name=${MARKER_CHECK_NAME}&filter=all&per_page=100`,
    ).then(
      // `json()` is `any`; markerCoverage checks each field it reads.
      (r) => r.json() as Promise<{ check_runs: CheckRun[] }>,
    ),
    latestJobs(runId),
  ]);
  const coverage = markerCoverage({
    runId,
    checkRuns: checks.check_runs,
    jobs,
  });
  if (!coverage.covered) {
    return coverage.reason;
  }
  console.log(
    `Attempt ${coverage.attempt} of this run was auto-passed: every failure was confirmed as a flake in CI Conductor.`,
  );
  return true;
}

function output(passed: boolean): void {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `passed=${passed}\n`);
  }
}

// `import.meta.main` is Bun's, so TypeScript's ImportMeta lacks it.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  covered(process.env)
    .then((result) => {
      if (result !== true) {
        console.log(`Not auto-passed: ${result}.`);
      }
      output(result === true);
    })
    .catch((error) => {
      console.log(
        `::warning::Couldn't check for a flaky auto-pass: ${error instanceof Error ? error.message : error}`,
      );
      output(false);
    });
}
