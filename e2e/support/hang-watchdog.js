// TEMPORARY (EMB-2490): find out where the page hangs before the renderer crashes.
// Keeps a CDP connection to each page with the debugger enabled. If the page stops
// answering, pauses the JS thread and prints the stack.
const POLL_MS = 2000;
const CPU_MS = 2000;
const ANSWER_TIMEOUT_MS = 6000;

const log = (...args) => console.log("[hang-watchdog]", ...args);

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

// targetId -> { ws, pending, send, onPaused, reported }
const connections = new Map();

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const conn = { ws, pending, onPaused: null, reported: false, nextId: 0 };
  conn.send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++conn.nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? msg.error ?? {});
      pending.delete(msg.id);
    } else if (msg.method === "Debugger.paused" && conn.onPaused) {
      conn.onPaused(msg.params);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      // Lines logged by the Cypress command listener in component-cypress.js.
      const text = msg.params.args
        .map((a) => a.value ?? a.description)
        .join(" ");
      if (text.startsWith("[cy-cmd]")) {
        log(text);
      }
    }
  };
  ws.onclose = () => connections.delete(target.id);

  const opened = await withTimeout(
    new Promise((resolve) => (ws.onopen = () => resolve(true))),
    ANSWER_TIMEOUT_MS,
  );
  if (!opened) {
    return null;
  }
  // Must happen while the page is healthy: a frozen page cannot process it.
  await withTimeout(conn.send("Debugger.enable"), ANSWER_TIMEOUT_MS);
  await withTimeout(conn.send("Runtime.enable"), ANSWER_TIMEOUT_MS);
  connections.set(target.id, conn);
  return conn;
}

async function check(target) {
  const conn = connections.get(target.id) ?? (await connect(target));
  if (!conn) {
    return;
  }

  const heap = await withTimeout(
    conn.send("Runtime.getHeapUsage"),
    ANSWER_TIMEOUT_MS,
  );
  if (heap) {
    conn.reported = false;
    log(`ok heap=${Math.round(heap.usedSize / 1e6)}MB`);
    return;
  }
  if (conn.reported) {
    return;
  }
  conn.reported = true;

  log("NO ANSWER from the page, pausing to get the stack");
  const paused = new Promise((resolve) => (conn.onPaused = resolve));
  conn.send("Debugger.pause");
  const params = await withTimeout(paused, ANSWER_TIMEOUT_MS);
  if (!params) {
    log("could not pause the page");
    return;
  }
  log("STACK AT HANG:");
  params.callFrames.slice(0, 30).forEach((frame) => {
    log(
      `  ${frame.functionName || "(anonymous)"} ${frame.url.slice(-90)}:${frame.location.lineNumber}:${frame.location.columnNumber}`,
    );
  });
  conn.send("Debugger.resume");
}

// Browser-level connection: still works when a page is frozen. Logs how much CPU
// each renderer used since the last sample (busy = native computation, idle = blocked).
async function startCpuSampling(port) {
  // The hook runs before Chrome starts, so retry until it answers.
  let webSocketDebuggerUrl;
  while (!webSocketDebuggerUrl) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      ({ webSocketDebuggerUrl } = await res.json());
    } catch (e) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  const ws = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? {});
      pending.delete(msg.id);
    }
  };
  await withTimeout(
    new Promise((resolve) => (ws.onopen = () => resolve(true))),
    ANSWER_TIMEOUT_MS,
  );

  const last = new Map();
  const timer = setInterval(async () => {
    const id = ++nextId;
    const result = await withTimeout(
      new Promise((resolve) => {
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method: "SystemInfo.getProcessInfo" }));
      }),
      ANSWER_TIMEOUT_MS,
    );
    const parts = (result?.processInfo ?? [])
      .filter((p) => p.type === "renderer")
      .map((p) => {
        const delta = p.cpuTime - (last.get(p.id) ?? p.cpuTime);
        last.set(p.id, p.cpuTime);
        return `${p.id}:+${delta.toFixed(2)}s`;
      });
    log(`renderer cpu per ${CPU_MS / 1000}s: ${parts.join(" ") || "n/a"}`);
  }, CPU_MS);
  timer.unref();
}

function startHangWatchdog(port) {
  log(`watching Chrome on port ${port}`);
  startCpuSampling(port).catch((e) => log("cpu sampling error", e.message));
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      const res = await withTimeout(
        fetch(`http://127.0.0.1:${port}/json`),
        ANSWER_TIMEOUT_MS,
      );
      const targets = res ? await res.json() : [];
      for (const target of targets.filter((t) => t.type === "page")) {
        await check(target);
      }
    } catch (e) {
      log("poll error", e.message);
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
}

module.exports = { startHangWatchdog };
