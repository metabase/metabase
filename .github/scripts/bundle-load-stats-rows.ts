// Turns the conditions matrix.js prints into rows for the "Bundle Load Times"
// table, stamped with the commit they came from. The per-merge uploader and the
// backfill both go through here so their rows cannot drift apart.

/** One condition, as `frontend/build/bench/matrix.js` reports it. */
export interface Condition {
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
  runs: number;
}

export interface CommitStamp {
  sha: string;
  /**
   * YYYY-MM-DD, or empty for today. A backfill measures an old commit today,
   * so without it every backfilled row would claim today's date and the series
   * would collapse onto one day.
   */
  date?: string;
  subject: string;
}

export type LoadTimeRow = Record<string, string | number>;

export function buildRows(
  conditions: Condition[],
  { sha, date, subject }: CommitStamp,
): LoadTimeRow[] {
  return conditions.map((condition) => ({
    Date: date || new Date().toISOString().slice(0, 10),
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
    Runs: condition.runs,
  }));
}
