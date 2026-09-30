// On a re-run of a PR's tests, asks ci-conductor whether every failure on the
// PR's head commit is a flake. When it is sure, and a person has confirmed it,
// writes `auto-pass=true` to GITHUB_OUTPUT (run-tests.yml turns that into a
// skip for every test workflow), records the auto-pass in eng-stats, and says so
// on the PR.
//
// Anything short of a clear yes — a missing secret, an unreachable server, an
// answer about another commit — leaves the output unset, so the re-run goes
// ahead as it always has. Never exits non-zero: this gate must not fail a run.
//
// Never logs the ci-conductor host or the secret: metabase/metabase is public.

import { appendFileSync } from "node:fs";

import { importStats } from "./stats-import";

export const STATS_TABLE = "flaky_rerun_auto_passes";

// Asking may mean a model call on ci-conductor's side, so allow for a slow answer.
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

/** The fields of ci-conductor's `GET /api/flake-probability` answer this gate reads. */
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
    return { autoPass: false, reason: "no one has confirmed the failures as flakes" };
  }
  if (!answer.sha || answer.sha.toLowerCase() !== headSha.toLowerCase()) {
    return {
      autoPass: false,
      reason: `the answer is about ${answer.sha ?? "no commit"}, not ${headSha}`,
    };
  }
  const p = answer.flake_probability;
  if (typeof p !== "number" || p < 0 || p > 1) {
    return { autoPass: false, reason: `flake_probability ${p} is not a probability` };
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

type Context = {
  prNumber: number;
  headSha: string;
  author: string;
  baseUrl: string;
  secret: string;
};

/** The run's identity from env, or the reason there's nothing to check. */
export function readContext(env: NodeJS.ProcessEnv): Context | { skip: string } {
  // Belt and braces: the job's `if:` already limits this to PR re-runs, and it
  // must never act on a master or release branch push.
  if (env.GITHUB_EVENT_NAME !== "pull_request") {
    return { skip: `event is ${env.GITHUB_EVENT_NAME}, not pull_request` };
  }
  if (!env.GITHUB_RUN_ATTEMPT || env.GITHUB_RUN_ATTEMPT === "1") {
    return { skip: "first attempt, not a re-run" };
  }
  const prNumber = Number(env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return { skip: "no PR number" };
  }
  if (!env.HEAD_SHA) {
    return { skip: "no head sha" };
  }
  if (!env.CI_CONDUCTOR_BASE_URL || !env.CI_CONDUCTOR_WEBHOOK_SECRET) {
    return { skip: "CI_CONDUCTOR_BASE_URL or CI_CONDUCTOR_WEBHOOK_SECRET is not set" };
  }
  return {
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
      console.log(`GET ${path} failed: ${error instanceof Error ? error.message : error}`);
      if (attempt >= MAX_ATTEMPTS) {
        return null;
      }
    }
    await sleep(retryDelayMs * attempt);
  }
}

async function recordAutoPass(ctx: Context, flakeProbability: number): Promise<void> {
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
  const { GITHUB_API_URL = "https://api.github.com", GITHUB_REPOSITORY, GITHUB_TOKEN } =
    process.env;
  const response = await fetch(
    `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/${ctx.prNumber}/comments`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`comment POST → ${response.status} ${await response.text()}`);
  }
  console.log(`Commented on #${ctx.prNumber}.`);
}

function setOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
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
    console.log("Couldn't get a flake verdict from ci-conductor. Re-running as usual.");
    return;
  }

  const decision = decideAutoPass(answer, ctx.headSha);
  if (!decision.autoPass) {
    console.log(`Not auto-passing: ${decision.reason}. Re-running as usual.`);
    return;
  }

  // The output is what skips the tests, so it goes first: the record and the
  // comment below are best-effort and must not stand in its way.
  setOutput("auto-pass", "true");
  const percent = formatPercent(decision.flakeProbability);
  console.log(`Auto-passing: every failure is likely flaky (${percent}) and confirmed.`);

  const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  summarize(
    `### Auto-passing this re-run\n\nEvery failure on \`${ctx.headSha}\` is likely flaky ` +
      `(${percent} flake probability) and was confirmed in CI Conductor, so the test jobs are skipped.`,
  );

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
// running the gate.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  main().catch((error) => {
    console.warn("::warning::Flaky re-run check failed; re-running as usual:", error);
  });
}
