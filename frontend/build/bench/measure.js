/* eslint-env node */

/**
 * Loads a page repeatedly in a throttled headless Chrome and reports how long
 * the initial bundle takes to download, parse and run.
 *
 * `domContentLoadedEventEnd` is the number to read. A `defer` script is
 * guaranteed to have downloaded, parsed and executed before DOMContentLoaded
 * fires, so it brackets exactly the work a chunk layout can move around. It also
 * survives the app erroring against the stub API, which a paint metric does not.
 *
 * The first load fills the HTTP cache, the second fills V8's code cache, and the
 * loads after that are the steady state a returning user sees. Both are
 * reported, because a chunk layout can help one and hurt the other.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const url = process.argv[2];
const runs = Number(process.argv[3] || 8);
const cpuThrottle = Number(process.env.CPU_THROTTLE || 4);
const mbps = Number(process.env.NETWORK_MBPS || 10);
const latency = Number(process.env.NETWORK_LATENCY || 40);
const keepCache = Boolean(process.env.WARM);
// Signs the load in, so the document carries what a real user's does: their
// locale and, once the build writes them, the route's preload hints.
const sessionCookie = process.env.SESSION_COOKIE || "";
const port = 9222 + Number(process.env.PORT_OFFSET || 0);

if (!url) {
  console.error("usage: node measure.js <url> [runs]");
  console.error(
    "env: CPU_THROTTLE NETWORK_MBPS NETWORK_LATENCY WARM PORT_OFFSET SESSION_COOKIE",
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cleared by the first load that shows the build records no performance
// marks, so the rest of the series skips waiting for them.
let buildRecordsMarks = true;

function devtools(path, method = "GET") {
  return new Promise((resolve, reject) => {
    http
      .request({ host: "127.0.0.1", port, path, method }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            resolve({});
          }
        });
      })
      .on("error", reject)
      .end();
  });
}

/** The slice of the DevTools protocol this needs, over the native WebSocket. */
class Session {
  constructor(socket) {
    this.socket = socket;
    this.lastId = 0;
    this.pending = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const resolve = this.pending.get(message.id);
      if (resolve) {
        this.pending.delete(message.id);
        resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.lastId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }
}

// Everything up to `load` comes from navigation timing, and the paint entries
// say when the browser first drew. `mb:app-mounted` and `mb:page-ready` are the
// two the app records itself, because only it knows when the shell committed
// and when the page has its data. See metabase/utils/performance-marks.ts.
const READ_METRICS = `JSON.stringify((() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const scripts = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.endsWith(".js"));
  const paint = (name) => {
    const entry = performance.getEntriesByName(name)[0];
    return entry ? entry.startTime : 0;
  };
  const last = (type) => {
    const entries = performance.getEntriesByType(type);
    return entries.length ? entries[entries.length - 1].startTime : 0;
  };
  return {
    href: location.href,
    ttfb: nav ? nav.responseStart : 0,
    domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
    load: nav ? nav.loadEventEnd : 0,
    firstPaint: paint("first-paint"),
    firstContentfulPaint: paint("first-contentful-paint"),
    largestContentfulPaint: last("largest-contentful-paint"),
    appMounted: paint("mb:app-mounted"),
    pageReady: paint("mb:page-ready"),
    lastScriptEnd: Math.max(0, ...scripts.map((entry) => entry.responseEnd)),
    scriptCount: scripts.length,
    scriptBytes: scripts.reduce((total, entry) => total + entry.encodedBodySize, 0),
  };
})())`;

async function launchChrome() {
  const chrome = spawn(CHROME, [
    "--headless=new",
    // The harness only ever loads its own server on localhost, and a Chrome
    // installed by CI has no SUID sandbox binary to use.
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${fs.mkdtempSync("/tmp/metabase-bench-")}`,
    "--no-first-run",
    "--disable-extensions",
    "--disable-background-networking",
    "--window-size=1280,900",
  ]);
  chrome.stderr.on("data", () => {});

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await devtools("/json/version");
      return chrome;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Chrome did not open a debugging port on ${port}`);
}

async function loadOnce() {
  const target = await devtools("/json/new?about:blank", "PUT");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  const session = new Session(socket);

  await session.send("Page.enable");
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: !keepCache });
  await session.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });

  if (mbps > 0) {
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency,
      downloadThroughput: (mbps * 1024 * 1024) / 8,
      uploadThroughput: (mbps * 1024 * 1024) / 8,
    });
  }

  if (sessionCookie) {
    await session.send("Network.setCookie", {
      name: "metabase.SESSION",
      value: sessionCookie,
      url,
    });
  }

  await session.send("Page.navigate", { url });

  const read = async () => {
    const { result } = await session.send("Runtime.evaluate", {
      expression: READ_METRICS,
      returnByValue: true,
    });
    return result && result.value ? JSON.parse(result.value) : null;
  };

  // Polled rather than waiting on a lifecycle event, because the app errors
  // against the stub API and a failed boot must still produce a reading. The
  // href check keeps the blank page the tab opens on out of the results.
  let metrics = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const parsed = await read();
    if (
      parsed &&
      parsed.domContentLoaded > 0 &&
      parsed.scriptCount > 0 &&
      parsed.href.startsWith(url)
    ) {
      metrics = parsed;
      break;
    }
    await sleep(150);
  }

  // The marks land after the entry scripts, and `mb:page-ready` only on a route
  // that records it. Wait a bounded while rather than missing them.
  //
  // They must not gate the reading itself. A jar built before the marks existed
  // never fires either one, which is every older commit the backfill measures,
  // and waiting on them there would turn each load into a 45s timeout and then
  // report no reading at all. One load settles it for the whole series, so the
  // rest do not pay the wait again.
  for (
    let attempt = 0;
    buildRecordsMarks && metrics && !metrics.pageReady && attempt < 40;
    attempt++
  ) {
    await sleep(150);
    metrics = (await read()) || metrics;
  }
  if (metrics && !metrics.appMounted) {
    buildRecordsMarks = false;
  }

  socket.close();
  await devtools(`/json/close/${target.id}`);
  return metrics;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

(async () => {
  const chrome = await launchChrome();
  const results = [];

  for (let run = 0; run < runs; run++) {
    const metrics = await loadOnce();
    if (metrics) {
      results.push(metrics);
    }
  }

  chrome.kill();

  if (results.length === 0) {
    console.error("no runs produced a reading");
    process.exit(1);
  }

  const at = (key, from = 0) =>
    Number(median(results.slice(from).map((result) => result[key])).toFixed(1));

  // Written with a callback rather than console.log so the process cannot exit
  // with the JSON still buffered in a pipe.
  process.stdout.write(
    JSON.stringify(
      {
        url,
        runs: results.length,
        cpuThrottle,
        network: mbps > 0 ? `${mbps} Mbps` : "unthrottled",
        cache: keepCache ? "kept between runs" : "disabled",
        scripts: results[0].scriptCount,
        scriptKb: Number((results[0].scriptBytes / 1024).toFixed(1)),
        firstLoadMs: Number(results[0].domContentLoaded.toFixed(1)),
        secondLoadMs:
          results.length > 1
            ? Number(results[1].domContentLoaded.toFixed(1))
            : null,
        medianDomContentLoadedMs: at("domContentLoaded"),
        steadyStateMs: results.length > 2 ? at("domContentLoaded", 2) : null,
        // The rest of the load, in the order a user meets it. A zero means the
        // browser or the route never reported that one.
        ttfbMs: at("ttfb"),
        firstContentfulPaintMs: at("firstContentfulPaint"),
        appMountedMs: at("appMounted"),
        largestContentfulPaintMs: at("largestContentfulPaint"),
        pageReadyMs: at("pageReady"),
        loadMs: at("load"),
        everyRunMs: results.map((result) =>
          Math.round(result.domContentLoaded),
        ),
      },
      null,
      2,
    ) + "\n",
    () => process.exit(0),
  );
})();
