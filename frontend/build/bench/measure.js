/* eslint-env node */
/* eslint-disable no-console -- printing the result is what this script is for */

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
const port = 9222 + Number(process.env.PORT_OFFSET || 0);

if (!url) {
  console.error("usage: node measure.js <url> [runs]");
  console.error(
    "env: CPU_THROTTLE NETWORK_MBPS NETWORK_LATENCY WARM PORT_OFFSET",
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const READ_METRICS = `JSON.stringify((() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource");
  const url = (value) => new URL(value, location.href).href;

  // The entry scripts gate DOMContentLoaded. Preloaded files do not: they are
  // what the page's own chunk needs, and the question is whether fetching them
  // early delays the entry, and when they become available.
  const entry = new Set([...document.querySelectorAll("script[src]")].map((s) => url(s.src)));
  // The entry scripts are preloaded too, by the build. Exclude them, so this
  // set is only what the page's own chunk needs.
  const preloaded = new Set(
    [...document.querySelectorAll('link[rel="preload"]')]
      .map((l) => url(l.href))
      .filter((href) => !entry.has(href)),
  );

  const endOf = (names) => {
    const ends = resources.filter((r) => names.has(r.name)).map((r) => r.responseEnd);
    return ends.length ? Math.max(...ends) : 0;
  };
  const bytesOf = (names) =>
    resources.filter((r) => names.has(r.name)).reduce((t, r) => t + r.encodedBodySize, 0);

  return {
    href: location.href,
    domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
    lastScriptEnd: endOf(entry),
    lastPreloadEnd: endOf(preloaded),
    scriptCount: entry.size,
    preloadCount: preloaded.size,
    scriptBytes: bytesOf(entry),
    preloadBytes: bytesOf(preloaded),
  };
})())`;

async function launchChrome() {
  const chrome = spawn(CHROME, [
    "--headless=new",
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

  await session.send("Page.navigate", { url });

  // Polled rather than waiting on a lifecycle event, because the app errors
  // against the stub API and a failed boot must still produce a reading. The
  // href check keeps the blank page the tab opens on out of the results.
  let metrics = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const { result } = await session.send("Runtime.evaluate", {
      expression: READ_METRICS,
      returnByValue: true,
    });
    const parsed = result && result.value ? JSON.parse(result.value) : null;
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

  console.log(
    JSON.stringify(
      {
        url,
        runs: results.length,
        cpuThrottle,
        network: mbps > 0 ? `${mbps} Mbps` : "unthrottled",
        cache: keepCache ? "kept between runs" : "disabled",
        scripts: results[0].scriptCount,
        scriptKb: Number((results[0].scriptBytes / 1024).toFixed(1)),
        preloads: results[0].preloadCount,
        preloadKb: Number((results[0].preloadBytes / 1024).toFixed(1)),
        medianEntryReadyMs: at("lastScriptEnd"),
        medianPreloadReadyMs: at("lastPreloadEnd"),
        firstLoadMs: Number(results[0].domContentLoaded.toFixed(1)),
        medianDomContentLoadedMs: at("domContentLoaded"),
        steadyStateMs: results.length > 2 ? at("domContentLoaded", 2) : null,
        everyRunMs: results.map((result) =>
          Math.round(result.domContentLoaded),
        ),
      },
      null,
      2,
    ),
  );
  process.exit(0);
})();
