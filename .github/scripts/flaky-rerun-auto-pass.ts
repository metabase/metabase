// CI Conductor's "make pass" button dispatches this for a PR's failed "Run
// tests" run. It asks ci-conductor whether every failure on the PR's head commit
// is a flake. When it is sure, and a person has confirmed it, it marks the run
// as auto-passed and re-runs only the run's failed `*-result` jobs. It also
// records the auto-pass in eng-stats and says so on the PR.
//
// Why re-run the result jobs instead of posting passing checks: a passing check
// posted from here lands in its own check suite, and GitHub counts every check
// suite's copy of a required check, so the run's own failed `*-result` check kept
// the PR blocked. A re-run job replaces its check in the run's own suite. Each
// result job asks flaky-auto-pass-result.ts whether a marker covers the run's
// failures, and passes when one does.
//
// Anything short of a clear yes (auto-pass turned off, an unreachable server, an
// answer about another commit) passes nothing and leaves the run as it is.
// Re-running is a separate button in CI Conductor.
//
// Runs from flaky-rerun-auto-pass.yml, so no test suite needs to know about it.
// GitHub sends no `workflow_run: requested` event for a re-run, which is why a
// dispatch starts this, not the re-run itself.
//
// Never logs the ci-conductor host or the secret: metabase/metabase is public.

import { appendFileSync } from "node:fs";

import { importStats } from "./stats-import";

export const STATS_TABLE = "flaky_rerun_auto_passes";

// The only workflow whose jobs this may pass.
export const RUN_TESTS_PATH = ".github/workflows/run-tests.yml";

// Asking may mean a model call on ci-conductor's side, so allow for a slow answer.
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

/** The fields of ci-conductor's `GET /api/flake-probability` answer this script reads. */
export type FlakeProbabilityAnswer = {
  status?: string;
  sha?: string;
  flake_probability?: number;
  verdict?: string;
  flake_confirmed?: boolean;
};

export type AutoPassDecision =
  | { autoPass: true; flakeProbability: number }
  | { autoPass: false; reason: string };

/**
 * Auto-pass only when all three hold: ci-conductor's verdict is "likely_flaky",
 * a person has confirmed the failures as flakes, and the answer is about the
 * exact commit this run tested (a newer push must not inherit the verdict).
 */
export function decideAutoPass(
  answer: FlakeProbabilityAnswer,
  headSha: string,
): AutoPassDecision {
  if (answer.verdict !== "likely_flaky") {
    return {
      autoPass: false,
      reason: `verdict is "${answer.verdict ?? answer.status ?? "missing"}", not "likely_flaky"`,
    };
  }
  if (answer.flake_confirmed !== true) {
    return {
      autoPass: false,
      reason: "no one has confirmed the failures as flakes",
    };
  }
  if (!answer.sha || answer.sha.toLowerCase() !== headSha.toLowerCase()) {
    return {
      autoPass: false,
      reason: `the answer is about ${answer.sha ?? "no commit"}, not ${headSha}`,
    };
  }
  const p = answer.flake_probability;
  if (typeof p !== "number" || p < 0 || p > 1) {
    return {
      autoPass: false,
      reason: `flake_probability ${p} is not a probability`,
    };
  }
  return { autoPass: true, flakeProbability: p };
}

export function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

export function autoPassComment(opts: {
  headSha: string;
  flakeProbability: number;
  runUrl: string;
}): string {
  const { headSha, flakeProbability, runUrl } = opts;
  return (
    `All job failures on \`${headSha.slice(0, 7)}\` are likely flaky ` +
    `(${formatPercent(flakeProbability)} flake probability, confirmed in CI Conductor), ` +
    `so we auto-passed [this run](${runUrl}) instead of running its tests again: ` +
    `only its result checks ran again.`
  );
}

type Job = { name: string; conclusion: string | null };

// The check this leaves on the commit when it auto-passes a run. Its external_id
// names the run and the attempt it judged (markerExternalId). Not a required
// check, so it blocks and passes nothing by itself.
export const MARKER_CHECK_NAME = "flaky-auto-pass";

// The required checks of "Run tests" (master's branch protection), one per
// suite. Each is a job that sums up its suite's jobs, so these are the only jobs
// to re-run. Keep in step with branch protection.
export const RESULT_JOB_NAMES: ReadonlySet<string> = new Set([
  "app-db-tests / app-db-tests-result",
  "backend-tests / be-tests-result",
  "driver-tests / drivers-tests-result",
  "e2e-tests / e2e-tests-result",
  "frontend-tests / fe-tests-result",
  "loki-tests / visual-test",
  "sdk-tests / embedding-sdk-tests-result",
]);

export function markerExternalId(runId: number, attempt: number): string {
  return `${runId}:${attempt}`;
}

/** The run and attempt a marker judged, or null for anything else. */
export function parseMarker(
  externalId: string | null | undefined,
): { runId: number; attempt: number } | null {
  const match = /^(\d+):(\d+)$/.exec(externalId ?? "");
  if (!match) {
    return null;
  }
  return { runId: Number(match[1]), attempt: Number(match[2]) };
}

/** The failed result jobs of an attempt, each named once: the jobs to re-run. */
export function failedResultJobNames(jobs: Job[]): string[] {
  return failedJobNames(jobs).filter((name) => RESULT_JOB_NAMES.has(name));
}

/** The fields of a job in `GET /actions/runs/{id}/jobs?filter=latest` this reads. */
export type LatestJob = {
  name: string;
  status: string;
  conclusion: string | null;
  run_attempt?: number;
};

/** The fields of a check run in `GET /commits/{sha}/check-runs` this reads. */
export type CheckRun = {
  external_id: string | null;
  conclusion: string | null;
  app: { slug: string } | null;
};

/**
 * Whether an auto-pass covers a run's failures, for its result jobs. It does
 * when a marker for this run exists, and every test job that hasn't passed
 * last ran in the attempt the marker judged, or an earlier one. A job re-run
 * since then has results nobody judged, so it is not covered. The result jobs
 * are left out: they are what the auto-pass re-runs, and one is running now.
 */
export function markerCoverage(opts: {
  runId: number;
  checkRuns: CheckRun[];
  jobs: LatestJob[];
}): { covered: true; attempt: number } | { covered: false; reason: string } {
  const { runId, checkRuns, jobs } = opts;
  const attempts = checkRuns
    .filter(
      (check) =>
        check.app?.slug === "github-actions" && check.conclusion === "success",
    )
    .map((check) => parseMarker(check.external_id))
    .filter((marker) => marker?.runId === runId)
    .map((marker) => marker!.attempt);
  if (attempts.length === 0) {
    return { covered: false, reason: "no auto-pass marker for this run" };
  }
  const attempt = Math.max(...attempts);
  const uncovered = jobs.filter(
    (job) =>
      !RESULT_JOB_NAMES.has(job.name) &&
      !(
        job.status === "completed" &&
        PASSING_CONCLUSIONS.has(job.conclusion ?? "")
      ) &&
      !(job.status === "completed" && (job.run_attempt ?? Infinity) <= attempt),
  );
  if (uncovered.length > 0) {
    return {
      covered: false,
      reason: `jobs ran again after attempt ${attempt} was auto-passed: ${[
        ...new Set(uncovered.map((job) => job.name)),
      ].join(", ")}`,
    };
  }
  return { covered: true, attempt };
}

// Branch protection counts a skipped check as passing.
const PASSING_CONCLUSIONS = new Set(["success", "skipped", "neutral"]);

/** Every job that failed on an attempt, each named once. */
export function failedJobNames(jobs: Job[]): string[] {
  return [
    ...new Set(
      jobs.filter((job) => job.conclusion === "failure").map((job) => job.name),
    ),
  ];
}

/**
 * Every job of an attempt that neither passed nor failed, such as a cancelled or
 * timed-out one. It has no test results, so no flake verdict covers it.
 */
export function unfinishedJobNames(jobs: Job[]): string[] {
  return [
    ...new Set(
      jobs
        .filter(
          (job) =>
            job.conclusion !== "failure" &&
            !PASSING_CONCLUSIONS.has(job.conclusion ?? ""),
        )
        .map((job) => job.name),
    ),
  ];
}

type Context = {
  runId: number;
  prNumber: number;
  headSha: string;
};

/** The dispatch inputs from env, or the reason they can't be used. */
export function readContext(
  env: NodeJS.ProcessEnv,
): Context | { skip: string } {
  const runId = Number(env.RUN_ID);
  if (!Number.isInteger(runId) || runId <= 0) {
    return { skip: "no run id" };
  }
  const prNumber = Number(env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return { skip: "no PR number" };
  }
  const headSha = env.HEAD_SHA ?? "";
  if (!/^[0-9a-f]{40}$/i.test(headSha)) {
    return { skip: "no head sha" };
  }
  return { runId, prNumber, headSha };
}

/** The fields of `GET /actions/runs/{id}` this script reads. */
export type WorkflowRun = {
  path: string;
  event: string;
  status: string;
  head_sha: string;
  head_branch: string | null;
  run_attempt: number;
  head_repository: { full_name: string } | null;
};

/** The fields of `GET /pulls/{number}` this script reads. */
export type PullRequest = {
  state: string;
  user: { login: string } | null;
  head: { sha: string; ref: string; repo: { full_name: string } | null };
};

/**
 * Why the dispatched run is not one to act on, or null when it is: a finished
 * "Run tests" run of a PR from this repo, for the commit the PR is at now.
 * Passing anything else would be wrong.
 */
export function runMismatch(opts: {
  run: WorkflowRun;
  pr: PullRequest;
  headSha: string;
  repository: string;
}): string | null {
  const { run, pr, headSha, repository } = opts;
  const sha = headSha.toLowerCase();
  if (run.path !== RUN_TESTS_PATH) {
    return `the run is of ${run.path}, not ${RUN_TESTS_PATH}`;
  }
  // It must never act on a master or release branch push.
  if (run.event !== "pull_request") {
    return `the run's event is ${run.event}, not pull_request`;
  }
  if (run.head_repository?.full_name !== repository) {
    return "the run is of a fork";
  }
  if (run.head_sha.toLowerCase() !== sha) {
    return `the run tested ${run.head_sha}, not ${headSha}`;
  }
  if (pr.state !== "open") {
    return `the PR is ${pr.state}`;
  }
  if (
    pr.head.sha.toLowerCase() !== sha ||
    pr.head.ref !== run.head_branch ||
    pr.head.repo?.full_name !== repository
  ) {
    return `the PR is at ${pr.head.sha}, not the run's commit`;
  }
  if (run.status !== "completed") {
    return `the run is ${run.status}, not completed`;
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The flake answer for a PR, or null when it can't be had. A model failure is a
 * 502 whose body is still an answer (status "unavailable"), so 5xx and 429 are
 * retried; any other non-ok status answers the same way every time.
 */
export async function fetchFlakeProbability(opts: {
  baseUrl: string;
  secret: string;
  prNumber: number;
  retryDelayMs?: number;
}): Promise<FlakeProbabilityAnswer | null> {
  const { baseUrl, secret, prNumber, retryDelayMs = 2000 } = opts;
  const path = `/api/flake-probability?pr=${prNumber}`;
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "x-api-key": secret },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        // `json()` is `any`; every field of the answer type is optional, and
        // decideAutoPass checks each one it reads.
        return (await response.json()) as FlakeProbabilityAnswer;
      }
      console.log(`GET ${path} → ${response.status} ${response.statusText}`);
      const retryable = response.status >= 500 || response.status === 429;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        return null;
      }
    } catch (error) {
      console.log(
        `GET ${path} failed: ${error instanceof Error ? error.message : error}`,
      );
      if (attempt >= MAX_ATTEMPTS) {
        return null;
      }
    }
    await sleep(retryDelayMs * attempt);
  }
}

/**
 * Why the failures can't be passed, or the flake probability to pass them with. Each step only runs when the ones before it
 * allow an auto-pass, so a turned-off auto-pass never calls ci-conductor.
 */
async function decide(
  env: NodeJS.ProcessEnv,
  ctx: Context,
  jobs: Job[],
): Promise<AutoPassDecision> {
  if (env.ENABLE_AUTO_PASS !== "true") {
    return { autoPass: false, reason: "ENABLE_AUTO_PASS is not 'true'" };
  }
  const unfinished = unfinishedJobNames(jobs);
  if (unfinished.length > 0) {
    return {
      autoPass: false,
      reason: `jobs didn't finish (${unfinished.join(", ")}), so no flake verdict covers them`,
    };
  }
  if (!env.CI_CONDUCTOR_BASE_URL || !env.CI_CONDUCTOR_WEBHOOK_SECRET) {
    return {
      autoPass: false,
      reason: "CI_CONDUCTOR_BASE_URL or CI_CONDUCTOR_WEBHOOK_SECRET is not set",
    };
  }
  const answer = await fetchFlakeProbability({
    baseUrl: env.CI_CONDUCTOR_BASE_URL,
    secret: env.CI_CONDUCTOR_WEBHOOK_SECRET,
    prNumber: ctx.prNumber,
  });
  if (!answer) {
    return {
      autoPass: false,
      reason: "couldn't get a flake verdict from ci-conductor",
    };
  }
  return decideAutoPass(answer, ctx.headSha);
}

export async function github(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const {
    GITHUB_API_URL = "https://api.github.com",
    GITHUB_REPOSITORY,
    GITHUB_TOKEN,
  } = process.env;
  const response = await fetch(
    `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}${path}`,
    {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${response.status} ${await response.text()}`,
    );
  }
  return response;
}

async function pagedJobs<T>(path: string): Promise<T[]> {
  const jobs: T[] = [];
  for (let page = 1; ; page++) {
    const data: { jobs: T[] } = await (
      await github(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      )
    ).json();
    jobs.push(...data.jobs);
    if (data.jobs.length < 100) {
      return jobs;
    }
  }
}

function attemptJobs(runId: number, attempt: number): Promise<Job[]> {
  return pagedJobs<Job>(`/actions/runs/${runId}/attempts/${attempt}/jobs`);
}

/** Each job of a run as it last ran, whichever attempt that was. */
export function latestJobs(
  runId: number,
): Promise<Array<LatestJob & { id: number }>> {
  return pagedJobs(`/actions/runs/${runId}/jobs?filter=latest`);
}

/** The marker the result jobs look for: this run's `attempt` is auto-passed. */
async function postMarker(
  ctx: Context,
  attempt: number,
  failed: string[],
  summary: string,
): Promise<void> {
  await github("/check-runs", {
    method: "POST",
    body: {
      name: MARKER_CHECK_NAME,
      head_sha: ctx.headSha,
      external_id: markerExternalId(ctx.runId, attempt),
      status: "completed",
      conclusion: "success",
      output: {
        title: "Auto-passed: confirmed flaky",
        summary,
        text: `Failed jobs of attempt ${attempt}:\n\n${failed.map((name) => `- ${name}`).join("\n")}`,
      },
    },
  });
  console.log(`Marked attempt ${attempt} of run ${ctx.runId} as auto-passed.`);
}

const RUN_POLL_MS = 10_000;
const RUN_WAIT_MS = 5 * 60_000;

/**
 * Re-runs one job and waits for the run to finish. One at a time: GitHub
 * refuses to re-run a job while the run is re-running another.
 */
async function rerunJob(runId: number, name: string): Promise<string> {
  const job = (await latestJobs(runId)).find((j) => j.name === name);
  if (!job) {
    return "not found";
  }
  const before: WorkflowRun = await (
    await github(`/actions/runs/${runId}`)
  ).json();
  await github(`/actions/jobs/${job.id}/rerun`, { method: "POST" });
  console.log(`Re-running ${name}.`);
  // The run reads "completed" until the re-run starts, so wait for a new attempt.
  const deadline = Date.now() + RUN_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(RUN_POLL_MS);
    const run: WorkflowRun = await (
      await github(`/actions/runs/${runId}`)
    ).json();
    if (run.run_attempt > before.run_attempt && run.status === "completed") {
      const after = (await latestJobs(runId)).find((j) => j.name === name);
      return after?.conclusion ?? "unknown";
    }
  }
  return "still running";
}

async function recordAutoPass(
  ctx: Context,
  author: string,
  flakeProbability: number,
): Promise<void> {
  await importStats({
    table: STATS_TABLE,
    rows: [
      {
        pr_number: ctx.prNumber,
        sha: ctx.headSha,
        author,
        flake_probability: flakeProbability,
        skipped_at: new Date().toISOString(),
      },
    ],
  });
  console.log(`Recorded the auto-pass in ${STATS_TABLE}.`);
}

async function commentOnPr(ctx: Context, body: string): Promise<void> {
  await github(`/issues/${ctx.prNumber}/comments`, {
    method: "POST",
    body: { body },
  });
  console.log(`Commented on #${ctx.prNumber}.`);
}

function summarize(markdown: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

async function main(): Promise<void> {
  const ctx = readContext(process.env);
  if ("skip" in ctx) {
    console.log(`Doing nothing: ${ctx.skip}.`);
    return;
  }

  const [run, pr]: [WorkflowRun, PullRequest] = await Promise.all([
    github(`/actions/runs/${ctx.runId}`).then((r) => r.json()),
    github(`/pulls/${ctx.prNumber}`).then((r) => r.json()),
  ]);
  const mismatch = runMismatch({
    run,
    pr,
    headSha: ctx.headSha,
    repository: process.env.GITHUB_REPOSITORY ?? "",
  });
  if (mismatch) {
    console.log(`Doing nothing: ${mismatch}.`);
    return;
  }

  const jobs = await attemptJobs(ctx.runId, run.run_attempt);
  const failed = failedJobNames(jobs);
  if (failed.length === 0) {
    console.log("Doing nothing: the run has no failed jobs.");
    return;
  }

  const decision = await decide(process.env, ctx, jobs);
  if (!decision.autoPass) {
    console.log(`::warning::Not auto-passing: ${decision.reason}.`);
    summarize(`### Didn't auto-pass\n\n${decision.reason}.`);
    return;
  }

  const percent = formatPercent(decision.flakeProbability);
  console.log(
    `Auto-passing: every failure is likely flaky (${percent}) and confirmed.`,
  );
  const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${ctx.runId}`;
  const summary =
    `Every failure on \`${ctx.headSha}\` is likely flaky (${percent} flake probability) ` +
    `and was confirmed in CI Conductor, so [this run](${runUrl}) was auto-passed.`;
  await postMarker(ctx, run.run_attempt, failed, summary);

  const reruns: string[] = [];
  for (const name of failedResultJobNames(jobs)) {
    const conclusion = await rerunJob(ctx.runId, name);
    console.log(`${name}: ${conclusion}.`);
    reruns.push(`- ${name}: ${conclusion}`);
    if (conclusion !== "success") {
      console.log(
        `::warning::${name} did not pass on its re-run (${conclusion}).`,
      );
    }
  }
  summarize(
    `### Auto-passed a confirmed-flaky run\n\n${summary}\n\nRe-ran its failed result checks:\n\n${reruns.join("\n") || "(none failed)"}`,
  );

  // Best-effort: the result checks are what matter, and they have re-run.
  const results = await Promise.allSettled([
    recordAutoPass(ctx, pr.user?.login ?? "", decision.flakeProbability),
    commentOnPr(
      ctx,
      autoPassComment({
        headSha: ctx.headSha,
        flakeProbability: decision.flakeProbability,
        runUrl,
      }),
    ),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(`::warning::${result.reason}`);
    }
  }
}

// `import.meta.main` keeps the specs, which import the helpers above, from
// running the script.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  main().catch((error) => {
    console.warn("::warning::Flaky auto-pass failed:", error);
    process.exitCode = 1;
  });
}
