// When someone re-runs a PR's "Run tests", asks ci-conductor whether every
// failure on the PR's head commit is a flake. When it is sure, and a person has
// confirmed it, cancels the re-run and posts a passing check for each job that
// failed on the previous attempt or was left unpassed by the cancel, which
// includes the required `*-result` checks.
// It also records the auto-pass in eng-stats and says so on the PR.
//
// Runs from flaky-rerun-auto-pass.yml, so no test suite needs to know about it.
//
// Anything short of a clear yes (a missing secret, an unreachable server, an
// answer about another commit) leaves the re-run alone, so it goes ahead as it
// always has.
//
// Never logs the ci-conductor host or the secret: metabase/metabase is public.

import { appendFileSync } from "node:fs";

import { importStats } from "./stats-import";

export const STATS_TABLE = "flaky_rerun_auto_passes";

// Asking may mean a model call on ci-conductor's side, so allow for a slow answer.
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
// The passing checks must be newer than the cancelled ones, so wait for the
// cancel to land before posting them.
const CANCEL_POLL_MS = 5_000;
const CANCEL_TIMEOUT_MS = 5 * 60_000;

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
    `so we are auto-passing the failed jobs on this [re-run](${runUrl}) instead of running them again.`
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

/**
 * The names to post passing checks for, once the re-run is cancelled: every job
 * that failed on the previous attempt, plus every job of the cancelled attempt
 * that isn't passing. The cancel also hits jobs that passed or were skipped
 * before ("Re-run all jobs" runs them again, and "Re-run failed jobs" runs their
 * dependents), and their newest check is now a cancelled one. The previous
 * attempt has no unfinished jobs (main checks), so each of these either failed
 * as a flake or passed before.
 */
export function jobNamesToPass(previous: Job[], cancelled: Job[]): string[] {
  return [
    ...new Set([
      ...failedJobNames(previous),
      ...cancelled
        .filter((job) => !PASSING_CONCLUSIONS.has(job.conclusion ?? ""))
        .map((job) => job.name),
    ]),
  ];
}

type Context = {
  runId: number;
  runAttempt: number;
  prNumber: number;
  headSha: string;
  author: string;
  baseUrl: string;
  secret: string;
};

/** The re-run's identity from env, or the reason there's nothing to check. */
export function readContext(
  env: NodeJS.ProcessEnv,
): Context | { skip: string } {
  // Belt and braces: the job's `if:` already limits this to PR re-runs, and it
  // must never act on a master or release branch push.
  if (env.RUN_EVENT !== "pull_request") {
    return { skip: `event is ${env.RUN_EVENT}, not pull_request` };
  }
  const runAttempt = Number(env.RUN_ATTEMPT);
  if (!Number.isInteger(runAttempt) || runAttempt < 2) {
    return { skip: "first attempt, not a re-run" };
  }
  const runId = Number(env.RUN_ID);
  if (!Number.isInteger(runId) || runId <= 0) {
    return { skip: "no run id" };
  }
  const prNumber = Number(env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return { skip: "no PR number" };
  }
  if (!env.HEAD_SHA) {
    return { skip: "no head sha" };
  }
  if (!env.CI_CONDUCTOR_BASE_URL || !env.CI_CONDUCTOR_WEBHOOK_SECRET) {
    return {
      skip: "CI_CONDUCTOR_BASE_URL or CI_CONDUCTOR_WEBHOOK_SECRET is not set",
    };
  }
  return {
    runId,
    runAttempt,
    prNumber,
    headSha: env.HEAD_SHA,
    author: env.PR_AUTHOR ?? "",
    baseUrl: env.CI_CONDUCTOR_BASE_URL,
    secret: env.CI_CONDUCTOR_WEBHOOK_SECRET,
  };
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

async function cancelRun(ctx: Context): Promise<void> {
  await github(`/actions/runs/${ctx.runId}/cancel`, { method: "POST" });
  const deadline = Date.now() + CANCEL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const run: { status: string } = await (
      await github(`/actions/runs/${ctx.runId}`)
    ).json();
    if (run.status === "completed") {
      console.log("Cancelled the re-run.");
      return;
    }
    await sleep(CANCEL_POLL_MS);
  }
  throw new Error("the re-run did not finish cancelling in time");
}

async function attemptJobs(ctx: Context, attempt: number): Promise<Job[]> {
  const jobs: Job[] = [];
  for (let page = 1; ; page++) {
    const data: { jobs: Job[] } = await (
      await github(
        `/actions/runs/${ctx.runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`,
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
  flakeProbability: number,
): Promise<void> {
  await importStats({
    table: STATS_TABLE,
    rows: [
      {
        pr_number: ctx.prNumber,
        sha: ctx.headSha,
        author: ctx.author,
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
    console.log(`Not checking for flakes: ${ctx.skip}. Re-running as usual.`);
    return;
  }

  const answer = await fetchFlakeProbability(ctx);
  if (!answer) {
    console.log(
      "Couldn't get a flake verdict from ci-conductor. Re-running as usual.",
    );
    return;
  }

  const decision = decideAutoPass(answer, ctx.headSha);
  if (!decision.autoPass) {
    console.log(`Not auto-passing: ${decision.reason}. Re-running as usual.`);
    return;
  }

  // Read the failures before cancelling, so a failure here leaves the re-run running.
  const previous = await attemptJobs(ctx, ctx.runAttempt - 1);
  if (failedJobNames(previous).length === 0) {
    console.log(
      "The previous attempt has no failed jobs. Re-running as usual.",
    );
    return;
  }
  const unfinished = unfinishedJobNames(previous);
  if (unfinished.length > 0) {
    console.log(
      `The previous attempt has jobs that didn't finish (${unfinished.join(", ")}), ` +
        "so no flake verdict covers them. Re-running as usual.",
    );
    return;
  }

  const percent = formatPercent(decision.flakeProbability);
  console.log(
    `Auto-passing: every failure is likely flaky (${percent}) and confirmed.`,
  );
  await cancelRun(ctx);
  const toPass = jobNamesToPass(
    previous,
    await attemptJobs(ctx, ctx.runAttempt),
  );

  const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${ctx.runId}`;
  const summary =
    `Every failure on \`${ctx.headSha}\` is likely flaky (${percent} flake probability) ` +
    `and was confirmed in CI Conductor, so [this re-run](${runUrl}) was cancelled and the jobs it left unpassed were passed.`;
  for (const name of toPass) {
    await postPassingCheck(ctx, name, summary);
  }
  summarize(`### Auto-passed a confirmed-flaky re-run\n\n${summary}`);

  // Best-effort: the checks are what matter, and they are already in place.
  const results = await Promise.allSettled([
    recordAutoPass(ctx, decision.flakeProbability),
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
    console.warn("::warning::Flaky re-run check failed:", error);
    process.exitCode = 1;
  });
}
