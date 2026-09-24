/**
 * Per-test usage capture for the nightly instrumented e2e runs.
 *
 * For every test (attempt) this records:
 *  - every HTTP request it made: app traffic (fetch/XHR/assets/documents)
 *    via a pass-through middleware intercept plus fetch/XHR wrappers
 *    installed on every app window, and setup traffic issued through
 *    cy.request (helpers like H.createQuestion never hit cy.intercept
 *    because they go through the Cypress server, not the browser). Capture
 *    is deliberately unfiltered — same-origin requests record as paths,
 *    third-party ones keep their origin — so filtering policy (e.g. "only
 *    backend API endpoints") lives in the offline manifest builder, where
 *    it can change without re-running a nightly.
 *  - the pages it navigated to: document loads of the app window
 *    (window:before:load, which fires regardless of which hook triggered
 *    the visit) and framed documents (via the intercept's resourceType).
 *  - which instrumented functions fired, read browser-side from each app
 *    window's Istanbul counters (window.__coverage__). The counters are
 *    zeroed after every flush, so each test reports only its own fires —
 *    they cannot be diffed node-side against @cypress/code-coverage's
 *    .nyc_output/out.json because the plugin only writes that file once per
 *    spec (combineCoverage merges in memory; coverageReport persists).
 *
 * Two app-traffic capture paths on purpose: the intercept sees traffic the
 * window wrappers can't (child iframes in embedding specs), while the
 * wrappers see traffic the intercept can't — suite-level before() hooks run
 * ahead of every beforeEach and intercepts reset between tests, so no
 * intercept can be live during them, but window:before:load fires for every
 * app window regardless of which hook visited it. The overlap dedupes at
 * flush.
 *
 * The afterEach flush below MUST run after @cypress/code-coverage's own
 * afterEach, which sends the window's cumulative counters to the plugin's
 * accumulator — zeroing before that send would drop the test's fires from
 * the spec-level totals. That holds because this module is imported after
 * "@cypress/code-coverage/support" in e2e/support/cypress.js and root-level
 * hooks run in registration order. (A side effect of per-test zeroing is
 * that the plugin's summed spec totals become accurate instead of
 * re-counting each window's cumulative counters every test.)
 *
 * Known attribution gap, acceptable for manifest purposes: requests from
 * hooks attribute to the surrounding test:before:run/afterEach window, so
 * suite-level before() traffic lands on the suite's first test.
 */

const isInstrumented = Cypress.expose("coverage") === true;

// Journey-capture runs also record one ordered event stream per test:
// navigations, requests with their initiator, commands and assertions.
const journeyCapture =
  isInstrumented && Cypress.expose("journeyCapture") === true;
const backendCoverage =
  journeyCapture && Cypress.expose("backendCoverage") === true;
const MAX_EVENTS_PER_TEST = 5000;
const MAX_CUTS_PER_TEST = 2000;
const MAX_TEXT = 300;
// Longer than the deadline the config process puts on backend dumps, so a slow dump never fails the hook.
const JOURNEY_TASK_TIMEOUT = 120000;

// Step snapshots cut each test into code deltas at navigations, then also assertions, then also commands.
const STEP_LEVELS = { none: 0, navigations: 1, assertions: 2, commands: 3 };
const stepLevel = journeyCapture
  ? (STEP_LEVELS[Cypress.expose("stepSnapshots")] ?? 0)
  : 0;
const stepDumpUrl =
  stepLevel > 0 && backendCoverage ? Cypress.expose("stepDumpUrl") : null;
const JOURNEY_CAPTURE_PATH = "/__journey-capture/";

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

// Relative URLs resolve against this sentinel so they are distinguishable
// from absolute URLs pointing at third-party hosts (webhook testers, snowplow
// micro, ...), which record with their origin kept.
const RELATIVE_ORIGIN = "http://relative.invalid";

let routeBuffer = [];
let pageBuffer = [];
let eventBuffer = [];
let eventSeq = 0;
let testStartedAt = 0;

// Per-attempt step state, reset at test:before:run.
let attemptId = null;
let steps = [];
let stepsClosed = false;
let stepFiles = new Map();
let endedAssertLogs = new Set();
let commandSeqs = new WeakMap();
let captureStats = newCaptureStats();
// Fetch and XHR requests of the app window that have started and not finished.
let inFlight = 0;
let handlerDepth = 0;
// The matcher of this module's own pass-through intercept, which keeps its cy.intercept command out of the event stream.
let captureRoute = null;

// References to the __coverage__ objects of app windows that may still gain
// counts. Istanbul registers every instrumented chunk into one object per
// window, so holding the reference sees lazily-loaded files too. A reload
// creates a fresh object (tracked by the window:load handler below); the old
// one keeps any counts fired earlier in the same test until the flush.
let coverageObjects = [];

function trackCoverage(win) {
  const coverage = win.__coverage__;
  if (coverage && !coverageObjects.includes(coverage)) {
    coverageObjects.push(coverage);
  }
}

// Sums the per-file function counters across all tracked windows, zeroing
// every counter (functions, statements, branches) as it goes so the next
// flush reports only what fired after this one. Dead windows' objects are
// zeroed and pruned — only the current window can still gain counts.
function collectAndZeroFunctionCounts(currentWin) {
  trackCoverage(currentWin);
  const f = {};
  for (const coverage of coverageObjects) {
    for (const [file, fileCov] of Object.entries(coverage)) {
      const fired = fileCov.f || {};
      for (const [idx, count] of Object.entries(fired)) {
        if (count > 0) {
          const fileTotals = (f[file] ??= {});
          fileTotals[idx] = (fileTotals[idx] || 0) + count;
          fired[idx] = 0;
        }
      }
      for (const idx of Object.keys(fileCov.s || {})) {
        fileCov.s[idx] = 0;
      }
      for (const counts of Object.values(fileCov.b || {})) {
        counts.fill(0);
      }
    }
  }
  coverageObjects = coverageObjects.filter(
    (coverage) => coverage === currentWin.__coverage__,
  );
  return f;
}

function isInternalOrigin(origin) {
  if (origin === RELATIVE_ORIGIN) {
    return true;
  }
  const baseUrl = Cypress.config("baseUrl");
  try {
    return baseUrl != null && origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function clip(value) {
  const text = String(value);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

function currentPath() {
  try {
    return cy.state("window")?.location?.pathname ?? null;
  } catch {
    return null;
  }
}

function newCaptureStats() {
  return {
    snapshots: 0,
    snapshotMs: 0,
    eventMs: 0,
    dumpRequests: 0,
    errors: 0,
    droppedEvents: 0,
    droppedCuts: 0,
    lateCuts: 0,
    requestOverwrites: 0,
  };
}

function currentPhase() {
  const runnable = cy.state("runnable");
  if (!runnable) {
    return null;
  }
  return runnable.type === "hook" ? runnable.hookName : "test";
}

// Keeps recording errors out of Cypress and adds the handler's time, minus any step snapshot it took, to `eventMs`.
function guarded(handler) {
  return (...args) => {
    const started = performance.now();
    const snapshotMsBefore = captureStats.snapshotMs;
    handlerDepth += 1;
    try {
      handler(...args);
    } catch {
      captureStats.errors += 1;
    } finally {
      handlerDepth -= 1;
    }
    captureStats.eventMs +=
      performance.now() -
      started -
      (captureStats.snapshotMs - snapshotMsBefore);
  };
}

// `phase` tells hook traffic (setup) apart from the test body.
// Returns the event's seq, or null when it wasn't recorded.
function recordEvent(kind, data) {
  if (!journeyCapture) {
    return null;
  }
  if (eventBuffer.length >= MAX_EVENTS_PER_TEST) {
    captureStats.droppedEvents += 1;
    return null;
  }
  const started = performance.now();
  let seq = null;
  try {
    seq = eventSeq++;
    eventBuffer.push({
      seq,
      t: Math.round(started - testStartedAt),
      kind,
      phase: currentPhase(),
      url: currentPath(),
      ...data,
    });
  } catch {
    captureStats.errors += 1;
  }
  if (handlerDepth === 0) {
    captureStats.eventMs += performance.now() - started;
  }
  return seq;
}

function stepFileIndex(file) {
  let index = stepFiles.get(file);
  if (index === undefined) {
    index = stepFiles.size;
    stepFiles.set(file, index);
  }
  return index;
}

// Per coverage object, the files a cut walks, each with its counts as of the previous cut.
const fileTables = new WeakMap();

function fileRecords(coverage) {
  let table = fileTables.get(coverage);
  if (!table) {
    table = { records: [], known: new Set(), size: 0 };
    fileTables.set(coverage, table);
  }
  // Lazily loaded modules add their files the first time they run, so new files show up as a larger key count.
  const size = Object.keys(coverage).length;
  if (size !== table.size) {
    table.size = size;
    for (const file in coverage) {
      if (!table.known.has(file)) {
        table.known.add(file);
        const counts = coverage[file]?.f;
        if (counts) {
          const n = Object.keys(counts).length;
          table.records.push({
            file,
            counts,
            n,
            previous: new Uint32Array(n),
          });
        }
      }
    }
  }
  return table.records;
}

// The flush zeroes the counters after every test, so the counts a cut compares against start from zero too.
function resetPreviousCounts() {
  for (const coverage of coverageObjects) {
    for (const record of fileTables.get(coverage)?.records ?? []) {
      record.previous.fill(0);
    }
  }
}

// Function counters that grew since the previous cut, as flat [file, fnIndex, delta] triples.
// The counters themselves are left alone, so the per-test flush still reads the real totals,
// which is what lets a reader check that the steps add up to them.
function functionDeltas() {
  const deltas = [];
  for (const coverage of coverageObjects) {
    for (const record of fileRecords(coverage)) {
      const { counts, n, previous } = record;
      for (let i = 0; i < n; i++) {
        const count = counts[i];
        if (count > previous[i]) {
          deltas.push(stepFileIndex(record.file), i, count - previous[i]);
          previous[i] = count;
        }
      }
    }
  }
  return deltas;
}

// Fire-and-forget, so the command queue never waits on the backend.
function requestBackendDump(step, seq) {
  captureStats.dumpRequests += 1;
  try {
    fetch(
      `${stepDumpUrl}?attempt=${attemptId}&step=${step}&seq=${seq}&sent=${Date.now()}`,
      {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
      },
    ).catch(() => {
      captureStats.errors += 1;
    });
  } catch {
    captureStats.errors += 1;
  }
}

// Runs synchronously inside Cypress event handlers and never queues a command.
function takeStep(trigger, triggerSeq) {
  if (stepLevel === 0) {
    return;
  }
  if (stepsClosed) {
    captureStats.lateCuts += 1;
    return;
  }
  if (trigger !== "end" && steps.length >= MAX_CUTS_PER_TEST) {
    captureStats.droppedCuts += 1;
    return;
  }
  const started = performance.now();
  captureStats.snapshots += 1;
  try {
    try {
      const win = cy.state("window");
      if (win) {
        trackCoverage(win);
      }
    } catch {
      // A cross-origin app window has no readable counters.
      captureStats.errors += 1;
    }
    const step = steps.length;
    const seq = eventSeq;
    steps.push({
      seq,
      trigger,
      triggerSeq,
      t: Math.round(started - testStartedAt),
      phase: currentPhase(),
      url: currentPath(),
      inFlight,
      f: functionDeltas(),
    });
    // The final cut gets the backend dump taken by the recordTestCapture task.
    if (stepDumpUrl && trigger !== "end") {
      requestBackendDump(step, seq);
    }
  } catch {
    captureStats.errors += 1;
  }
  captureStats.snapshotMs += performance.now() - started;
}

function trackInFlight(promise) {
  inFlight += 1;
  const done = () => {
    inFlight = Math.max(0, inFlight - 1);
  };
  promise.then(done, done);
}

function summarizeArg(arg) {
  if (typeof arg === "string") {
    return JSON.stringify(clip(arg));
  }
  if (typeof arg === "number" || typeof arg === "boolean" || arg == null) {
    return String(arg);
  }
  if (typeof arg === "function") {
    return "fn";
  }
  if (arg?.jquery || arg?.nodeType) {
    return "<element>";
  }
  try {
    return clip(JSON.stringify(arg));
  } catch {
    return "<object>";
  }
}

// The commands of one `cy.a().b().should()` chain share a chainerId.
function chainOf(command) {
  const chainerId = command?.get?.("chainerId");
  const parts = [];
  let current = command;
  while (
    current &&
    current.get("chainerId") === chainerId &&
    parts.length < 8
  ) {
    const args = (current.get("args") || []).map(summarizeArg).join(", ");
    parts.unshift(`${current.get("name")}(${args})`);
    current = current.get("prev");
  }
  return parts.join(".");
}

// Cypress keeps the JS stack from when a command was enqueued, which still has the helper frames.
// The spec bundle is not minified, so frame names are the helper function names.
const SPEC_BUNDLE_FRAME =
  /at (?:async )?([\w$.]+) \((?:[^)]*__cypress\/tests[^)]*)\)/;

function helpersOf(command) {
  const stack = command?.get?.("userInvocationStack");
  if (typeof stack !== "string") {
    return undefined;
  }
  const names = [];
  for (const line of stack.split("\n")) {
    const name = line.match(SPEC_BUNDLE_FRAME)?.[1];
    if (name && !names.includes(name)) {
      names.unshift(name);
    }
  }
  return names.length > 0 ? names : undefined;
}

function isCaptureCommand(command) {
  const name = command.get("name");
  return (
    name === "task" ||
    (name === "intercept" && command.get("args")?.[0] === captureRoute)
  );
}

function parseRoute(url) {
  if (typeof url !== "string") {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(url, RELATIVE_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  // Internal requests record as bare paths; third-party ones keep the origin
  // so the offline builder can tell them apart.
  const target = isInternalOrigin(parsed.origin)
    ? parsed.pathname
    : `${parsed.origin}${parsed.pathname}`;
  return { pathname: parsed.pathname, target };
}

// Returns the seq of the request event, or null when none was recorded.
function recordRoute(method, url, initiator, details) {
  const route = parseRoute(url);
  if (!route) {
    return null;
  }
  const upperMethod = String(method).toUpperCase();
  // The step snapshots' own backend dump requests are tagged and kept out of the routes.
  if (route.pathname.startsWith(JOURNEY_CAPTURE_PATH)) {
    return recordEvent("request", {
      initiator: "journey-capture",
      method: upperMethod,
      path: route.target,
    });
  }
  routeBuffer.push(`${upperMethod} ${route.target}`);
  if (!initiator) {
    return null;
  }
  return recordEvent("request", {
    initiator,
    method: upperMethod,
    path: route.target,
    ...details,
  });
}

// Document navigations of the app's own pages (query/hash stripped).
// Only the top window's loads become `nav` events.
function recordPage(url, { topWindow = false } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return; // about:blank and friends
  }
  if (isInternalOrigin(parsed.origin)) {
    pageBuffer.push(parsed.pathname);
    if (topWindow) {
      recordEvent("nav", { how: "document", path: parsed.pathname });
    }
  }
}

// Mirrors how Cypress itself disambiguates cy.request(url), cy.request(url,
// body), cy.request(method, url[, body]) and cy.request(options).
function requestTarget(args) {
  const [first, second] = args;
  if (first != null && typeof first === "object") {
    return [first.method || "GET", first.url];
  } else if (
    typeof second === "string" &&
    HTTP_METHODS.has(String(first).toUpperCase())
  ) {
    return [first, second];
  } else if (typeof first === "string") {
    return ["GET", first];
  }
  return null;
}

function recordRequestArgs(args) {
  const target = requestTarget(args);
  if (target) {
    recordRoute(target[0], target[1]);
  }
}

// Records a fetch() call. `input` is fetch's first argument (string, URL, or
// Request); per the fetch spec an explicit init.method overrides a Request's.
function recordFetchArgs(win, input, init) {
  if (input instanceof win.Request) {
    recordRoute(init?.method || input.method || "GET", input.url, "fetch");
  } else {
    recordRoute(init?.method || "GET", String(input), "fetch");
  }
}

if (isInstrumented) {
  // Fires once per attempt, before any of the attempt's hooks.
  Cypress.on("test:before:run", () => {
    routeBuffer = [];
    pageBuffer = [];
    eventBuffer = [];
    eventSeq = 0;
    testStartedAt = performance.now();
    attemptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    steps = [];
    stepsClosed = false;
    stepFiles = new Map();
    endedAssertLogs = new Set();
    commandSeqs = new WeakMap();
    captureStats = newCaptureStats();
    if (stepLevel > 0) {
      resetPreviousCounts();
    }
  });

  // Every app page load, including ones triggered inside suite-level
  // before() hooks. At load time all synchronously-executed instrumented
  // chunks have registered, so __coverage__ exists.
  Cypress.on("window:load", trackCoverage);

  Cypress.on("window:before:load", (win) => {
    // The previous document unloads here: its code gets a final cut and its unfinished requests stop counting.
    if (stepLevel >= STEP_LEVELS.navigations) {
      takeStep("document", eventSeq);
    }
    inFlight = 0;
    recordPage(win.location.href, { topWindow: true });

    const originalFetch = win.fetch;
    win.fetch = function (input, init) {
      try {
        recordFetchArgs(win, input, init);
      } catch {
        // Recording must never break the app's request.
      }
      const result = originalFetch.apply(this, arguments);
      if (journeyCapture) {
        try {
          trackInFlight(result);
        } catch {
          captureStats.errors += 1;
        }
      }
      return result;
    };

    const trackedRequests = new WeakSet();
    const originalOpen = win.XMLHttpRequest.prototype.open;
    win.XMLHttpRequest.prototype.open = function (method, url) {
      try {
        recordRoute(method, String(url), "xhr");
        if (journeyCapture && !trackedRequests.has(this)) {
          trackedRequests.add(this);
          this.addEventListener("loadstart", () => {
            inFlight += 1;
          });
          this.addEventListener("loadend", () => {
            inFlight = Math.max(0, inFlight - 1);
          });
        }
      } catch {
        // Recording must never break the app's request.
      }
      return originalOpen.apply(this, arguments);
    };
  });

  beforeEach(() => {
    if (backendCoverage) {
      // Dumps and resets the backend counters.
      // Root beforeEach hooks run before the specs' own, so the test's setup lands in the test's dump.
      cy.task(
        "resetBackendCoverage",
        { spec: Cypress.spec.relative },
        { log: false, timeout: JOURNEY_TASK_TIMEOUT },
      );
    }
    captureRoute = { pathname: "/**", middleware: true };
    // middleware: true observes and passes through, so this coexists with the
    // specs' own cy.intercept stubs/waits without changing any behavior.
    cy.intercept(captureRoute, (req) => {
      recordRoute(req.method, req.url, `proxy:${req.resourceType}`);
      // Framed documents (embedding specs) never hit window:before:load,
      // which only fires for the top app window.
      if (req.resourceType === "document") {
        recordPage(req.url);
      }
    });
  });

  Cypress.Commands.overwrite("request", (originalFn, ...args) => {
    captureStats.requestOverwrites += 1;
    recordRequestArgs(args);
    return originalFn(...args);
  });

  if (journeyCapture) {
    // Fires for pushState and hash changes as well as document loads.
    Cypress.on(
      "url:changed",
      guarded((url) => {
        const seq = recordEvent("nav", {
          how: "url",
          path: new URL(url).pathname,
        });
        if (stepLevel >= STEP_LEVELS.navigations) {
          takeStep("nav", seq);
        }
      }),
    );

    Cypress.on(
      "command:start",
      guarded((command) => {
        if (isCaptureCommand(command)) {
          return;
        }
        const name = command.get("name");
        if (name === "request") {
          const target = requestTarget(command.get("args") || []);
          const helpers = helpersOf(command);
          const seq = target
            ? recordRoute(target[0], target[1], "cy.request", { helpers })
            : null;
          commandSeqs.set(
            command,
            seq ??
              recordEvent("request", {
                initiator: "cy.request",
                method: null,
                path: null,
                helpers,
              }),
          );
          return;
        }
        commandSeqs.set(
          command,
          recordEvent("command", {
            name,
            chain: chainOf(command),
            helpers: helpersOf(command),
          }),
        );
      }),
    );

    // `.should()` and `expect()` both log with name "assert", while the asserted command is current.
    // A retried `.should()` ends its log once, when it finally passes or fails, and that is the moment recorded.
    const onAssertLog = guarded((attrs) => {
      const ended = attrs.ended || (attrs.state && attrs.state !== "pending");
      if (attrs.name !== "assert" || !ended || endedAssertLogs.has(attrs.id)) {
        return;
      }
      endedAssertLogs.add(attrs.id);
      const current = cy.state("current");
      const seq = recordEvent("assert", {
        state: attrs.state,
        message: clip(attrs.message ?? ""),
        chain: chainOf(current),
        helpers: helpersOf(current),
      });
      if (stepLevel >= STEP_LEVELS.assertions) {
        takeStep("assert", seq);
      }
    });
    Cypress.on("log:added", onAssertLog);
    Cypress.on("log:changed", onAssertLog);

    if (stepLevel >= STEP_LEVELS.commands) {
      Cypress.on(
        "command:end",
        guarded((command) => {
          if (!isCaptureCommand(command)) {
            takeStep("command", commandSeqs.get(command) ?? null);
          }
        }),
      );
    }
  }

  afterEach(function () {
    const title = this.currentTest.fullTitle();
    const routes = [...new Set(routeBuffer)].sort();
    const pages = [...new Set(pageBuffer)].sort();
    let journey = {};
    if (journeyCapture) {
      try {
        journey = {
          events: eventBuffer,
          attempt: this.currentTest.currentRetry(),
          state: this.currentTest.state,
          spec: Cypress.spec.relative,
          durationMs: Math.round(performance.now() - testStartedAt),
          attemptId,
        };
      } catch {
        captureStats.errors += 1;
      }
    }
    routeBuffer = [];
    pageBuffer = [];
    eventBuffer = [];
    cy.window({ log: false }).then((win) => {
      // The final cut sits in the same synchronous turn as the flush, so the steps add up to the flushed totals.
      if (stepLevel > 0) {
        takeStep("end", eventSeq);
        stepsClosed = true;
      }
      const f = collectAndZeroFunctionCounts(win);
      if (journeyCapture) {
        journey.capture = captureStats;
        journey.steps =
          stepLevel > 0
            ? { files: [...stepFiles.keys()], cuts: steps }
            : undefined;
      }
      return cy.task(
        "recordTestCapture",
        { title, f, routes, pages, ...journey },
        journeyCapture
          ? { log: false, timeout: JOURNEY_TASK_TIMEOUT }
          : { log: false },
      );
    });
  });
}
