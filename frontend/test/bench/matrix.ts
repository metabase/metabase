/* eslint-env node */

/**
 * Runs the load benchmark across the conditions CI tracks, and prints one row
 * per condition.
 *
 * Each condition is measured twice. A series with the cache off gives the cold
 * load, where every run is a first visit. A series with the cache kept gives the
 * two loads that follow: the second visit, which reads the files from the HTTP
 * cache but still compiles them, and the steady state after V8 has cached the
 * compiled code.
 *
 * Times are relative to the machine that runs them. A CI runner is slower than a
 * laptop, so compare a number against the same machine's history, not against a
 * number from somewhere else.
 *
 * Point this at a real Metabase, which is what CI does, or at `serve.js` to
 * measure a built tree without a backend. Set SESSION_COOKIE to load the page
 * signed in.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** One reading, as `timings` in `measure.ts` builds it. */
interface Timings {
  ttfbMs: number;
  firstContentfulPaintMs: number;
  domContentLoadedMs: number;
  appMountedMs: number;
  largestContentfulPaintMs: number;
  pageReadyMs: number;
}

/** What one `measure.ts` series prints. */
interface Series {
  runs: number;
  locale: string;
  scripts: number;
  scriptKb: number;
  cssKb: number;
  totalKb: number;
  median: Timings;
  secondLoad: Timings | null;
  steady: Timings | null;
  everyRunMs: number[];
  calibrationMs: number;
}

interface Conditions {
  mbps: number;
  latency: number;
  throttle: number;
  warm: boolean;
  offset: number;
  /** Loads in this series. Defaults to the run count on the command line. */
  loads?: number;
}

const url = process.argv[2];
const runs = Number(process.argv[3] || 8);

if (!url) {
  console.error("usage: bun matrix.ts <url> [runs]");
  console.error("env: SESSION_COOKIE");
  process.exit(1);
}

// The cache-kept series spends its first run filling an empty cache, its second
// on the second visit, and the rest on the steady state.
if (runs < 3) {
  console.error("matrix.ts needs at least 3 runs per condition");
  process.exit(1);
}

/** Throughput in Mbps and added latency in ms. */
const NETWORKS = {
  fast: { mbps: 40, latency: 20 },
  slow: { mbps: 5, latency: 150 },
};

/**
 * CPU slowdown. Neither condition is 1, because 1 leaves the reading at the
 * mercy of whichever CPU the runner happened to draw, and a throttle absorbs
 * some of that spread rather than passing it straight through.
 */
const CPUS = { fast: 2, slow: 4 };

/**
 * A second visit happens once per browser profile, so one cache-kept series can
 * only ever produce one of them. Several short series in their own profiles give
 * that reading a median and a spread for about the loads one long series costs.
 */
const WARM_PROFILES = 3;
const WARM_LOADS = 3;

function measure({
  mbps,
  latency,
  throttle,
  warm,
  offset,
  loads,
}: Conditions): Promise<Series> {
  return new Promise<Series>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(import.meta.dirname, "measure.ts"),
        url,
        String(loads ?? runs),
      ],
      {
        stdio: ["ignore", "pipe", "inherit"],
        env: {
          ...process.env,
          NETWORK_MBPS: String(mbps),
          NETWORK_LATENCY: String(latency),
          CPU_THROTTLE: String(throttle),
          // Each series gets its own debugging port, so a Chrome that is slow
          // to release the last one cannot be mistaken for the new one.
          PORT_OFFSET: String(offset),
          WARM: warm ? "1" : "",
        },
      },
    );

    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) =>
      code === 0
        ? resolve(JSON.parse(output))
        : reject(new Error(`measure.ts exited with ${code}`)),
    );
  });
}

/**
 * How far the middle half of the cold runs spread, as a percent of the median.
 *
 * Cold is the number a reader watches, and on a shared runner it is the number
 * noise moves. Recording the spread beside it is what tells a real change from
 * a busy machine.
 */
/**
 * `measure.ts` leaves these empty for a series too short to hold them, which the
 * run count above rules out. Fail loudly rather than report a zero if it ever
 * stops filling one in.
 */
function required(timings: Timings | null, name: string): Timings {
  if (!timings) {
    throw new Error(`measure.ts reported no ${name}`);
  }
  return timings;
}

/**
 * The series whose reading is the median of the batch.
 *
 * Picking a series rather than averaging each reading keeps a state's readings
 * in order with each other, the same reason `measure.ts` reports one load per
 * state instead of a median per reading.
 */
function representativeSeries(
  batch: Series[],
  of: (series: Series) => Timings,
): Series {
  const sorted = [...batch].sort(
    (a, b) => of(a).domContentLoadedMs - of(b).domContentLoadedMs,
  );
  return sorted[Math.floor(sorted.length / 2)];
}

function readProc(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

const cpuModel =
  readProc("/proc/cpuinfo").match(/^model name\s*:\s*(.+)$/m)?.[1] ?? "";

/** What the host and the runner itself kept from the page, up to now. */
function contention() {
  // user nice system idle iowait irq softirq steal
  const jiffies = readProc("/proc/stat")
    .split("\n")[0]
    .trim()
    .split(/\s+/)
    .slice(1, 9)
    .map(Number);
  const stalled = readProc("/proc/pressure/cpu").match(/^some .*total=(\d+)/m);
  return {
    stealJiffies: jiffies[7] ?? 0,
    totalJiffies: jiffies.reduce((total, value) => total + value, 0),
    // -1 when the kernel reports no pressure.
    stalledMicros: stalled ? Number(stalled[1]) : -1,
    atMs: Date.now(),
  };
}

function percent(part: number, whole: number) {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0;
}

function spreadPercent(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.floor(sorted.length * fraction)];
  const middle = sorted[Math.floor(sorted.length / 2)];
  return Number((((at(0.75) - at(0.25)) / middle) * 100).toFixed(1));
}

(async () => {
  const rows = [];
  let offset = 0;

  // Object.keys widens to string, and these two objects are the only source of
  // condition names.
  for (const cpu of Object.keys(CPUS) as (keyof typeof CPUS)[]) {
    // Object.keys widens to string, as above.
    for (const network of Object.keys(NETWORKS) as (keyof typeof NETWORKS)[]) {
      const { mbps, latency } = NETWORKS[network];
      const throttle = CPUS[cpu];

      const before = contention();
      const cold = await measure({
        mbps,
        latency,
        throttle,
        warm: false,
        offset: offset++,
      });
      const warmBatch = [];
      for (let profile = 0; profile < WARM_PROFILES; profile++) {
        warmBatch.push(
          await measure({
            mbps,
            latency,
            throttle,
            warm: true,
            offset: offset++,
            loads: WARM_LOADS,
          }),
        );
      }

      // Each state picks its own series, because the second visit and the
      // steady state are different loads already.
      const warm = representativeSeries(warmBatch, (series) =>
        required(series.secondLoad, "secondLoad"),
      );
      const steadiest = representativeSeries(warmBatch, (series) =>
        required(series.steady, "steady"),
      );
      const after = contention();
      const calibrations = [cold, ...warmBatch]
        .map((series) => series.calibrationMs)
        .sort((a, b) => a - b);

      // Every cold reading in the row comes from `cold.median`, and every warm
      // reading from `warm.secondLoad`. Each is one load, so the readings in a
      // row stay in order with each other. A row assembled from a separate
      // median per reading describes a load that never happened.
      rows.push({
        network,
        networkMbps: mbps,
        latencyMs: latency,
        cpu,
        cpuThrottle: throttle,
        coldMs: cold.median.domContentLoadedMs,
        warmMs: required(warm.secondLoad, "secondLoad").domContentLoadedMs,
        steadyMs: required(steadiest.steady, "steady").domContentLoadedMs,
        coldSpreadPercent: spreadPercent(cold.everyRunMs),
        warmSpreadPercent: spreadPercent(
          warmBatch.map(
            (series) =>
              required(series.secondLoad, "secondLoad").domContentLoadedMs,
          ),
        ),
        steadySpreadPercent: spreadPercent(
          warmBatch.map(
            (series) => required(series.steady, "steady").domContentLoadedMs,
          ),
        ),
        // The cold load broken up, in the order a user meets it: bytes start
        // arriving, something is drawn, the shell commits, the page has its
        // data.
        coldTtfbMs: cold.median.ttfbMs,
        coldFirstPaintMs: cold.median.firstContentfulPaintMs,
        coldAppMountedMs: cold.median.appMountedMs,
        coldLargestPaintMs: cold.median.largestContentfulPaintMs,
        coldPageReadyMs: cold.median.pageReadyMs,
        warmPageReadyMs: required(warm.secondLoad, "secondLoad").pageReadyMs,
        // The same two readings for the visits that follow, so a returning
        // user's page is measured by when it draws rather than by
        // DOMContentLoaded alone.
        warmLargestPaintMs: required(warm.secondLoad, "secondLoad")
          .largestContentfulPaintMs,
        steadyLargestPaintMs: required(steadiest.steady, "steady")
          .largestContentfulPaintMs,
        steadyPageReadyMs: required(steadiest.steady, "steady").pageReadyMs,
        locale: cold.locale,
        scripts: cold.scripts,
        scriptKb: cold.scriptKb,
        cssKb: cold.cssKb,
        totalKb: cold.totalKb,
        runs: cold.runs,
        cpuModel,
        stealPercent: percent(
          after.stealJiffies - before.stealJiffies,
          after.totalJiffies - before.totalJiffies,
        ),
        cpuPressurePercent:
          after.stalledMicros < 0
            ? -1
            : percent(
                after.stalledMicros - before.stalledMicros,
                (after.atMs - before.atMs) * 1000,
              ),
        calibrationMs: calibrations[Math.floor(calibrations.length / 2)],
      });

      console.error(`measured ${cpu} cpu on a ${network} network`);
    }
  }

  // Written with a callback rather than console.log so the process cannot exit
  // with the JSON still buffered in a pipe.
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n", () =>
    process.exit(0),
  );
})();
