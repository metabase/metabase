import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Per-test function coverage from the nightly instrumented e2e run.
 *
 * The `E2E Coverage Manifest` workflow uploads one `coverage-shard-N`
 * artifact per shard. Each holds a JSON file per spec with, for every test,
 * the istanbul function ids that fired per product file, plus an
 * `fnmap-*.json` that maps those ids to a name and a start line. Functions
 * fired by a large share of all tests are boot noise and are dropped.
 */

export interface CoverageIndex {
  runId: string;
  sha: string;
  bootThreshold: number;
  totalTests: number;
  keys: string[];
  /** How many e2e tests fired each key. */
  frequency: number[];
  boot: number[];
  tests: IndexedTest[];
}

export interface IndexedTest {
  spec: string;
  title: string;
  rare: number[];
}

export interface FunctionRef {
  file: string;
  line: number;
  name: string;
}

interface ShardSpecFile {
  spec: string;
  tests: {
    title: string;
    f: Record<string, Record<string, number>>;
  }[];
}

type FunctionMap = Record<
  string,
  Record<string, { name: string; line: number }>
>;

const WORKFLOW = "e2e-coverage-manifest.yml";
const SHARD_ARTIFACT = /^coverage-shard-\d+$/;
const DOWNLOAD_CONCURRENCY = 8;

export function cacheRoot(repoRoot: string) {
  return path.join(repoRoot, "local", "claude", "e2e-coverage");
}

export function latestSuccessfulRun(): { runId: string; sha: string } {
  const raw = execFileSync(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      WORKFLOW,
      "-s",
      "success",
      "-L",
      "1",
      "--json",
      "databaseId,headSha",
    ],
    { encoding: "utf8" },
  );
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`no successful ${WORKFLOW} run found`);
  }
  const first: unknown = parsed[0];
  if (
    typeof first !== "object" ||
    first === null ||
    !("databaseId" in first) ||
    !("headSha" in first)
  ) {
    throw new Error("unexpected gh run list output");
  }
  return { runId: String(first.databaseId), sha: String(first.headSha) };
}

function listShardArtifacts(runId: string): string[] {
  const names: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const raw = execFileSync(
      "gh",
      [
        "api",
        `repos/{owner}/{repo}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`,
        "--jq",
        ".artifacts[].name",
      ],
      { encoding: "utf8" },
    );
    const pageNames = raw.split("\n").filter(Boolean);
    names.push(...pageNames);
    if (pageNames.length < 100) {
      break;
    }
  }
  return names.filter((name) => SHARD_ARTIFACT.test(name));
}

function download(runId: string, artifact: string, dir: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "gh",
      ["run", "download", runId, "-n", artifact, "-D", dir],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`download ${artifact} failed: ${stderr}`)),
    );
  });
}

export async function fetchShards(
  repoRoot: string,
  run: { runId: string; sha: string },
  log: (line: string) => void,
) {
  const shardsDir = path.join(cacheRoot(repoRoot), run.runId, "shards");
  const marker = path.join(shardsDir, ".complete");
  if (fs.existsSync(marker)) {
    return shardsDir;
  }
  const artifacts = listShardArtifacts(run.runId);
  log(`downloading ${artifacts.length} coverage shards of run ${run.runId}`);
  fs.mkdirSync(shardsDir, { recursive: true });
  const queue = [...artifacts];
  const workers = Array.from({ length: DOWNLOAD_CONCURRENCY }, async () => {
    for (let artifact = queue.shift(); artifact; artifact = queue.shift()) {
      const dir = path.join(shardsDir, artifact);
      if (!fs.existsSync(dir)) {
        await download(run.runId, artifact, dir);
      }
    }
  });
  await Promise.all(workers);
  fs.writeFileSync(marker, "");
  return shardsDir;
}

export function toRepoRelative(absolutePath: string) {
  const match = absolutePath.match(
    /(enterprise\/frontend\/src\/|frontend\/src\/).*$/,
  );
  return match ? match[0] : absolutePath;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isShardSpecFile(value: unknown): value is ShardSpecFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "spec" in value &&
    "tests" in value &&
    Array.isArray(value.tests)
  );
}

export function buildIndex(
  shardsDir: string,
  run: { runId: string; sha: string },
  bootThreshold: number,
): CoverageIndex {
  const keyIds = new Map<string, number>();
  const keys: string[] = [];
  const intern = (key: string) => {
    const existing = keyIds.get(key);
    if (existing !== undefined) {
      return existing;
    }
    keys.push(key);
    keyIds.set(key, keys.length - 1);
    return keys.length - 1;
  };
  const tests: { spec: string; title: string; fired: number[] }[] = [];
  const frequency: number[] = [];

  for (const shard of fs.readdirSync(shardsDir)) {
    const shardDir = path.join(shardsDir, shard);
    if (!fs.statSync(shardDir).isDirectory()) {
      continue;
    }
    const files = fs.readdirSync(shardDir);
    const functionMap: FunctionMap = {};
    for (const file of files.filter((name) => name.startsWith("fnmap-"))) {
      Object.assign(functionMap, readJson(path.join(shardDir, file)));
    }
    for (const file of files.filter((name) => name.includes("scenarios"))) {
      const parsed = readJson(path.join(shardDir, file));
      if (!isShardSpecFile(parsed)) {
        continue;
      }
      for (const test of parsed.tests) {
        const fired = new Set<number>();
        for (const [absoluteFile, functions] of Object.entries(test.f)) {
          const relative = toRepoRelative(absoluteFile);
          if (relative === absoluteFile) {
            continue;
          }
          const names = functionMap[absoluteFile] ?? {};
          for (const id of Object.keys(functions)) {
            const meta = names[id];
            if (!meta) {
              continue;
            }
            fired.add(intern(`${relative}#${meta.line}#${meta.name}`));
          }
        }
        for (const id of fired) {
          frequency[id] = (frequency[id] ?? 0) + 1;
        }
        tests.push({ spec: parsed.spec, title: test.title, fired: [...fired] });
      }
    }
  }

  const totalTests = tests.length;
  const boot = new Set<number>();
  frequency.forEach((count, id) => {
    if (count / totalTests >= bootThreshold) {
      boot.add(id);
    }
  });
  return {
    runId: run.runId,
    sha: run.sha,
    bootThreshold,
    totalTests,
    keys,
    frequency: keys.map((_key, id) => frequency[id] ?? 0),
    boot: [...boot],
    tests: tests.map(({ spec, title, fired }) => ({
      spec,
      title,
      rare: fired.filter((id) => !boot.has(id)),
    })),
  };
}

function isCoverageIndex(value: unknown): value is CoverageIndex {
  return (
    typeof value === "object" &&
    value !== null &&
    "keys" in value &&
    Array.isArray(value.keys) &&
    "frequency" in value &&
    Array.isArray(value.frequency) &&
    "tests" in value &&
    Array.isArray(value.tests)
  );
}

export function indexPath(
  repoRoot: string,
  runId: string,
  bootThreshold: number,
) {
  return path.join(
    cacheRoot(repoRoot),
    runId,
    `index-v2-${bootThreshold}.json`,
  );
}

export async function loadIndex(
  repoRoot: string,
  options: {
    runId?: string;
    bootThreshold: number;
    log: (line: string) => void;
  },
): Promise<CoverageIndex> {
  const run = options.runId
    ? { runId: options.runId, sha: "" }
    : latestSuccessfulRun();
  const cached = indexPath(repoRoot, run.runId, options.bootThreshold);
  if (fs.existsSync(cached)) {
    const parsed: unknown = readJson(cached);
    if (isCoverageIndex(parsed)) {
      return parsed;
    }
    fs.rmSync(cached);
  }
  const shardsDir = await fetchShards(repoRoot, run, options.log);
  options.log("indexing shards");
  const index = buildIndex(shardsDir, run, options.bootThreshold);
  fs.writeFileSync(cached, JSON.stringify(index));
  return index;
}

export function parseKey(key: string): FunctionRef {
  const [file, line, ...name] = key.split("#");
  return { file, line: Number(line), name: name.join("#") };
}

/**
 * Finds the nightly records for one deleted e2e test. Nightly titles are the
 * describe chain and the it title joined by spaces, so a bare it title
 * matches as a suffix.
 */
export function findTests(index: CoverageIndex, spec: string, title: string) {
  return index.tests.filter(
    (test) =>
      test.spec === spec &&
      (test.title === title || test.title.endsWith(` ${title}`)),
  );
}
