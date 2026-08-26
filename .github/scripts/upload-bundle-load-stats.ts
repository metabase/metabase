// Appends the measured load times to the "Bundle Load Times" table in
// eng-stats-importer. Reads ROWS (the JSON matrix.js prints) and API_KEY from
// env, and stamps each row with the commit it came from.

import { readFileSync } from "node:fs";

import { importStats } from "./stats-import";

/** One condition, as `frontend/build/bench/matrix.js` reports it. */
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
  scripts: number;
  scriptKb: number;
  runs: number;
}

async function main() {
  const path = process.env.ROWS || "artifacts/load-times.json";
  const conditions = JSON.parse(readFileSync(path, "utf8")) as Condition[];

  const rows = conditions.map((condition) => ({
    Date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    // Truncated the same way the bundle-size table does, so the two join.
    Commit: (process.env.HEAD_SHA || "").slice(0, 12),
    // The stats table carries a free-text Description column. Populate it with
    // the commit subject so the chart's points are self-describing.
    Description: (process.env.COMMIT_MESSAGE || "").split("\n")[0],
    Network: condition.network,
    "Network mbps": condition.networkMbps,
    "Latency ms": condition.latencyMs,
    CPU: condition.cpu,
    "CPU throttle": condition.cpuThrottle,
    "Cold ms": condition.coldMs,
    "Warm ms": condition.warmMs,
    "Steady ms": condition.steadyMs,
    "Cold spread %": condition.coldSpreadPercent,
    Scripts: condition.scripts,
    "Script kb": condition.scriptKb,
    Runs: condition.runs,
  }));

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
