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
const { spawn } = require("child_process");
const path = require("path");

const url = process.argv[2];
const runs = Number(process.argv[3] || 8);

if (!url) {
  console.error("usage: node matrix.js <url> [runs]");
  console.error("env: SESSION_COOKIE");
  process.exit(1);
}

/** Throughput in Mbps and added latency in ms. */
const NETWORKS = {
  fast: { mbps: 40, latency: 20 },
  slow: { mbps: 5, latency: 150 },
};

/** CPU slowdown, where 1 leaves the runner at its own speed. */
const CPUS = { fast: 1, slow: 4 };

function measure({ mbps, latency, throttle, warm, offset }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "measure.js"), url, String(runs)],
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
        : reject(new Error(`measure.js exited with ${code}`)),
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
function spreadPercent(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.floor(sorted.length * fraction)];
  const middle = sorted[Math.floor(sorted.length / 2)];
  return Number((((at(0.75) - at(0.25)) / middle) * 100).toFixed(1));
}

(async () => {
  const rows = [];
  let offset = 0;

  for (const cpu of Object.keys(CPUS)) {
    for (const network of Object.keys(NETWORKS)) {
      const { mbps, latency } = NETWORKS[network];
      const throttle = CPUS[cpu];

      const cold = await measure({
        mbps,
        latency,
        throttle,
        warm: false,
        offset: offset++,
      });
      const warm = await measure({
        mbps,
        latency,
        throttle,
        warm: true,
        offset: offset++,
      });

      rows.push({
        network,
        networkMbps: mbps,
        latencyMs: latency,
        cpu,
        cpuThrottle: throttle,
        coldMs: cold.medianDomContentLoadedMs,
        warmMs: warm.secondLoadMs,
        steadyMs: warm.steadyStateMs,
        coldSpreadPercent: spreadPercent(cold.everyRunMs),
        // The cold load broken up, in the order a user meets it: bytes start
        // arriving, something is drawn, the shell commits, the page has its
        // data. The warm equivalents come from the same series as `warmMs`.
        coldTtfbMs: cold.ttfbMs,
        coldFirstPaintMs: cold.firstContentfulPaintMs,
        coldAppMountedMs: cold.appMountedMs,
        coldLargestPaintMs: cold.largestContentfulPaintMs,
        coldPageReadyMs: cold.pageReadyMs,
        warmPageReadyMs: warm.pageReadyMs,
        scripts: cold.scripts,
        scriptKb: cold.scriptKb,
        runs: cold.runs,
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
