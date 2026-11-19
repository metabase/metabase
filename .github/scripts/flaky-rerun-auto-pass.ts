// CI Conductor's "make pass" button dispatches this for a PR's failed "Run
// tests" run. It asks ci-conductor whether every failure on the PR's head commit
// is a flake. When it is sure, and a person has confirmed it, it posts a passing
// check for each job that failed, which includes the required `*-result`
// checks. It also records the auto-pass in eng-stats and says so on the PR.
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
    `so we auto-passed the failed jobs of [this run](${runUrl}) instead of running them again.`
  );
}

type Job = { name: string; conclusion: string | null };

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

async function github(
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

async function attemptJobs(runId: number, attempt: number): Promise<Job[]> {
  const jobs: Job[] = [];
  for (let page = 1; ; page++) {
    const data: { jobs: Job[] } = await (
      await github(
        `/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`,
      )
    ).json();
    jobs.push(...data.jobs);
    if (data.jobs.length < 100) {
      return jobs;
    }
  }
}

/** A check from the GitHub Actions app with the same name as a job counts for branch protection. */
async function postPassingCheck(
  ctx: Context,
  name: string,
  summary: string,
): Promise<void> {
  await github("/check-runs", {
    method: "POST",
    body: {
      name,
      head_sha: ctx.headSha,
      status: "completed",
      conclusion: "success",
      output: { title: "Auto-passed: confirmed flaky", summary },
    },
  });
  console.log(`Passed ${name}.`);
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
    `and was confirmed in CI Conductor, so the failed jobs of [this run](${runUrl}) were passed.`;
  for (const name of failed) {
    await postPassingCheck(ctx, name, summary);
  }
  summarize(`### Auto-passed a confirmed-flaky run\n\n${summary}`);

  // Best-effort: the checks are what matter, and they are already in place.
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
