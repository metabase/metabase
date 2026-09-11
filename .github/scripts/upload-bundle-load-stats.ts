// Appends the measured load times to the "Bundle Load Times" table in
// eng-stats-importer. Reads ROWS (the JSON matrix.js prints) and API_KEY from
// env, and stamps each row with the commit it came from.

import { readFileSync } from "node:fs";

import { importStats } from "./stats-import";

/** One condition, as `frontend/test/bench/matrix.ts` reports it. */
interface Condition {
  network: string;
  networkMbps: number;
  latencyMs: number;
  cpu: string;
  cpuThrottle: number;
  coldMs: number;
  warmMs: number;
  steadyMs: number;
  coldSpreadPercent: number;
  coldTtfbMs: number;
  coldFirstPaintMs: number;
  coldAppMountedMs: number;
  coldLargestPaintMs: number;
  coldPageReadyMs: number;
  warmPageReadyMs: number;
  scripts: number;
  scriptKb: number;
  totalKb: number;
  runs: number;
}

interface CommitStamp {
  sha: string;
  subject: string;
  /** ISO 8601, in UTC. */
  timestamp: string;
}

type LoadTimeRow = Record<string, string | number>;

function buildRows(
  conditions: Condition[],
  { sha, subject, timestamp }: CommitStamp,
): LoadTimeRow[] {
  return conditions.map((condition) => ({
    // The commit's own time rather than the day it was measured, so the merges
    // of one day keep their order and a backfilled row lands on its commit.
    Date: timestamp,
    // Truncated the same way the bundle-size table does, so the two join.
    Commit: sha.slice(0, 12),
    // The stats table carries a free-text Description column. Populate it with
    // the commit subject so the chart's points are self-describing.
    Description: subject.split("\n")[0],
    Network: condition.network,
    "Network mbps": condition.networkMbps,
    "Latency ms": condition.latencyMs,
    CPU: condition.cpu,
    "CPU throttle": condition.cpuThrottle,
    "Cold ms": condition.coldMs,
    "Warm ms": condition.warmMs,
    "Steady ms": condition.steadyMs,
    "Cold spread %": condition.coldSpreadPercent,
    // The cold load broken up. A zero means the browser or the route never
    // reported that one, rather than that it happened at time zero.
    "Cold ttfb ms": condition.coldTtfbMs,
    "Cold first paint ms": condition.coldFirstPaintMs,
    "Cold app mounted ms": condition.coldAppMountedMs,
    "Cold largest paint ms": condition.coldLargestPaintMs,
    "Cold page ready ms": condition.coldPageReadyMs,
    "Warm page ready ms": condition.warmPageReadyMs,
    Scripts: condition.scripts,
    "Script kb": condition.scriptKb,
    "Total kb": condition.totalKb,
    Runs: condition.runs,
  }));
}

async function main() {
  const path = process.env.ROWS || "artifacts/load-times.json";
  // matrix.js wrote this file, and Condition is the shape it prints.
  const conditions = JSON.parse(readFileSync(path, "utf8")) as Condition[];

  const rows = buildRows(conditions, {
    sha: process.env.HEAD_SHA || "",
    subject: process.env.COMMIT_MESSAGE || "",
    timestamp: new Date(process.env.COMMIT_TIMESTAMP || Date.now()).toISOString(),
  });

  console.table(rows);

  try {
    await importStats({ table: "bundle_load_times", rows });
    console.log("Load times uploaded successfully");
  } catch (error) {
    // Stats logging is best-effort. A point lost to an unreachable importer is
    // worth less than a red build on master, and the next commit plots another.
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      `::warning::Load-time upload failed after retries; leaving run green: ${message}`,
    );
  }
}

main();
