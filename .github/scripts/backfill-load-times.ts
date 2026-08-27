// Measures the last COUNT commits on master and imports each as its own point.
//
// The commits run one after another on this runner. Load times are relative to
// the machine, so measuring them anywhere else would put a step in the series.
//
// Read the result with that in mind. Every backfilled point comes from one
// machine on one afternoon, while the live series takes one point a day from a
// different runner each time. The backfilled stretch looks steadier than what
// follows it, and that is the method rather than the code.
//
// pickCommitsToMeasure, planBackfill and buildRows are pure so they can be
// unit-tested. main() is the thin I/O wrapper around GitHub, the jar and Chrome.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Condition, buildRows } from "./bundle-load-stats-rows";
import { importStats } from "./stats-import";

export interface Commit {
  sha: string;
  /** YYYY-MM-DD */
  date: string;
  subject: string;
}

/** An artifact as `/repos/{repo}/actions/artifacts` lists it. */
export interface Artifact {
  id: number;
  name: string;
  expired: boolean;
}

export type CommitToMeasure = Commit & { artifactId: number | null };

export const uberjarName = (sha: string) => `metabase-ee-${sha}-uberjar`;

/**
 * Pairs each commit with its uberjar artifact. Uberjars are kept for 30 days,
 * so an older commit gets null and the caller skips it.
 */
export function pickCommitsToMeasure(
  commits: Commit[],
  artifactsBySha: Record<string, Artifact[]>,
): CommitToMeasure[] {
  return commits.map((commit) => {
    const live = (artifactsBySha[commit.sha] ?? []).find(
      (artifact) =>
        artifact.name === uberjarName(commit.sha) && !artifact.expired,
    );
    return { ...commit, artifactId: live?.id ?? null };
  });
}

// What one commit costs: downloading and unzipping the jar, booting the JVM and
// migrating a blank app db, then about 145s of measuring. That comes to three
// or four minutes, and five leaves room for a slow runner.
export const MINUTES_PER_COMMIT = 5;

export interface BackfillPlan {
  measure: number;
  dropped: number;
}

/**
 * How many of the requested commits fit inside the job timeout. Dropping the
 * rest up front means the shell logs them, where a timeout would kill the job
 * mid-loop and lose whatever it was measuring.
 */
export function planBackfill({
  count,
  timeoutMinutes,
  minutesPerCommit = MINUTES_PER_COMMIT,
}: {
  count: number;
  timeoutMinutes: number;
  minutesPerCommit?: number;
}): BackfillPlan {
  const fits = Math.max(0, Math.floor(timeoutMinutes / minutesPerCommit));
  const measure = Math.max(0, Math.min(count, fits));
  return { measure, dropped: Math.max(0, count - measure) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function github(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.GH_TOKEN}`,
      ...init.headers,
    },
  });
}

async function githubJson<T>(path: string): Promise<T> {
  const response = await github(path);
  if (!response.ok) {
    throw new Error(
      `GET ${path} failed: ${response.status} ${await response.text()}`,
    );
  }
  // The caller names the shape the endpoint documents. Nothing here validates it.
  return (await response.json()) as T;
}

interface CommitListing {
  sha: string;
  commit: { committer: { date: string }; message: string };
}

async function listCommits(repo: string, count: number): Promise<Commit[]> {
  const listing = await githubJson<CommitListing[]>(
    `/repos/${repo}/commits?sha=master&per_page=${count}`,
  );
  return listing.map(({ sha, commit }) => ({
    sha,
    date: commit.committer.date.split("T")[0],
    subject: commit.message.split("\n")[0],
  }));
}

async function listArtifacts(repo: string, sha: string): Promise<Artifact[]> {
  const { artifacts } = await githubJson<{ artifacts: Artifact[] }>(
    `/repos/${repo}/actions/artifacts?name=${uberjarName(sha)}`,
  );
  return artifacts;
}

async function downloadArtifact(
  repo: string,
  artifactId: number,
  zipPath: string,
) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await github(
        `/repos/${repo}/actions/artifacts/${artifactId}/zip`,
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      writeFileSync(zipPath, new Uint8Array(await response.arrayBuffer()));
      return;
    } catch (error) {
      if (attempt >= 3) {
        throw new Error(`could not download artifact ${artifactId}: ${error}`);
      }
      console.log(`::warning::download attempt ${attempt} failed`);
      await sleep(attempt * 15_000);
    }
  }
}

async function isUp(site: string) {
  try {
    const response = await fetch(`${site}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok && (await response.json()).status === "ok";
  } catch {
    return false;
  }
}

async function waitUntilUp(site: string) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await isUp(site)) {
      return;
    }
    await sleep(1000);
  }
  throw new Error(`no backend came up on ${site}`);
}

// Waits for whatever is on the port to go away. Without this the next commit's
// sign-in would reach the previous commit's backend and measure it twice.
async function waitUntilDown(site: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!(await isUp(site))) {
      return;
    }
    await sleep(1000);
  }
  throw new Error(`a backend is still answering on ${site}`);
}

const exited = (child: ChildProcess) =>
  new Promise<void>((resolve) => {
    if (child.exitCode === null) {
      child.on("exit", () => resolve());
    } else {
      resolve();
    }
  });

async function withBackend<T>(
  { jar, sha, site }: { jar: string; sha: string; site: string },
  fn: () => Promise<T>,
): Promise<T> {
  await waitUntilDown(site);
  // --add-opens matches how the jar is launched everywhere else
  // (uberjar.yml, pre-release.yml, bin/docker/run_metabase.sh), so the
  // benchmark runs the app under the JVM configuration we ship.
  const backend = spawn(
    "java",
    ["--add-opens", "java.base/java.nio=ALL-UNNAMED", "-jar", jar],
    {
      env: {
        ...process.env,
        // A fresh app db each time, so one version's migrations never meet another's.
        MB_DB_FILE: join(
          process.env.RUNNER_TEMP || tmpdir(),
          `backfill-${sha}`,
        ),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const log = `artifacts/metabase-${sha.slice(0, 12)}.log`;
  writeFileSync(log, "");
  backend.stdout.on("data", (chunk) => appendFileSync(log, chunk));
  backend.stderr.on("data", (chunk) => appendFileSync(log, chunk));

  try {
    await waitUntilUp(site);
    return await fn();
  } finally {
    backend.kill();
    await exited(backend);
    await waitUntilDown(site);
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, ...env },
  });
}

function signIn(site: string) {
  const session = run("node", ["frontend/build/bench/sign-in.js", site]).trim();
  // Masked because the token authenticates as that user.
  console.log(`::add-mask::${session}`);
  return session;
}

async function warm(site: string) {
  // The first document a fresh JVM renders pays for its own JIT.
  for (let i = 0; i < 5; i++) {
    await fetch(`${site}/`);
  }
}

function measure(site: string, runs: string, session: string): Condition[] {
  return JSON.parse(
    run("node", ["frontend/build/bench/matrix.js", `${site}/`, runs], {
      SESSION_COOKIE: session,
    }),
  );
}

async function importRows(rows: ReturnType<typeof buildRows>) {
  console.table(rows);
  try {
    await importStats({ table: "bundle_load_times", rows });
    console.log("Load times uploaded successfully");
  } catch (error) {
    // Stats logging is best-effort, and the next commit plots another point.
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning::Load-time upload failed after retries: ${message}`);
  }
}

async function main() {
  const count = Number(process.env.COUNT || 3);
  const runs = process.env.RUNS || "8";
  const repo = process.env.GITHUB_REPOSITORY || "metabase/metabase";
  const site = `http://localhost:${process.env.MB_JETTY_PORT || 4000}`;
  const timeoutMinutes = Number(process.env.TIMEOUT_MINUTES || 60);

  mkdirSync("artifacts", { recursive: true });
  mkdirSync("temp", { recursive: true });

  const commits = await listCommits(repo, count);
  const artifactsBySha: Record<string, Artifact[]> = {};
  for (const { sha } of commits) {
    artifactsBySha[sha] = await listArtifacts(repo, sha);
  }
  const picked = pickCommitsToMeasure(commits, artifactsBySha);

  const plan = planBackfill({ count: picked.length, timeoutMinutes });
  if (plan.dropped > 0) {
    console.log(
      `::warning::only ${plan.measure} of ${picked.length} commits fit in ${timeoutMinutes} minutes, dropping the oldest ${plan.dropped}`,
    );
  }

  for (const { sha, date, subject, artifactId } of picked.slice(
    0,
    plan.measure,
  )) {
    const short = sha.slice(0, 12);
    console.log(`::group::${date} ${short} ${subject}`);
    try {
      if (artifactId === null) {
        console.log(`::warning::no uberjar for ${short}, skipping`);
        continue;
      }

      rmSync("temp/unzip", { recursive: true, force: true });
      await downloadArtifact(repo, artifactId, "temp/mb.zip");
      execFileSync("unzip", ["-q", "-o", "temp/mb.zip", "-d", "temp/unzip"]);
      const jar = run("find", ["temp/unzip", "-name", "metabase.jar"]).split(
        "\n",
      )[0];

      const conditions = await withBackend({ jar, sha, site }, async () => {
        const session = signIn(site);
        await warm(site);
        return measure(site, runs, session);
      });
      writeFileSync(
        `artifacts/load-times-${short}.json`,
        JSON.stringify(conditions, null, 2),
      );
      rmSync("temp/unzip", { recursive: true, force: true });
      rmSync("temp/mb.zip", { force: true });

      await importRows(buildRows(conditions, { sha, date, subject }));
    } finally {
      console.log("::endgroup::");
    }
  }
}

// Only run the I/O wrapper when invoked directly, so importing the pure
// functions (from the spec) has no side effects.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  main().catch((error) => {
    console.log(
      `::error::${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
