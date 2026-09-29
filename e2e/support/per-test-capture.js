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

import { createCoverageCounters } from "./coverage-counters";
import {
  flattenBranchHits,
  interceptReplyArg,
  payloadFields,
  proxyBodyFields,
  requestBodyArg,
  requestBodyFields,
} from "./journey-capture-encoding";

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
const MAX_CHAIN_COMMANDS = 8;
// Chrome fails keepalive requests once 256 are in flight for a page,
// and a burst of assertion cuts can send more than that.
const STEP_DUMP_INTERVAL_MS = 250;
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

// The tasks of the capture itself, of @cypress/code-coverage and of cypress-terminal-report, which every test runs.
const HARNESS_TASKS = new Set([
  "recordTestCapture",
  "resetBackendCoverage",
  "resetTestCapture",
  "resetCoverage",
  "combineCoverage",
  "coverageReport",
  "ctrLogMessages",
  "ctrLogFiles",
]);

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

// Cypress sends every intercepted response to the browser with its body, over its DevTools connection,
// and Chrome closes that connection on a message over 100 MiB, which hangs the run.
// A hot dev build's instrumented bundles make messages bigger than that,
// so the capture's intercept matches every path but theirs.
const INTERCEPTED_PATHS = /^(?!.*\.hot(?:\.bundle|-update)\.js$)/;

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
let assertCallSites = new Map();
let commandSeqs = new WeakMap();
// The attributes of the attempt's commands, by chainerId, in the order they were enqueued.
let chainCommands = new Map();
let lastDumpRequestAt = -Infinity;
let captureStats = newCaptureStats();
// Fetch and XHR requests of the app window that have started and not finished.
let inFlight = 0;
let handlerDepth = 0;
// The matcher of this module's own pass-through intercept, which keeps its cy.intercept command out of the event stream.
let captureRoute = null;

// Journey-capture runs also read the counters of same-origin child frames, where embedding tests run the app.
const counters = createCoverageCounters({
  frames: journeyCapture,
  onError: () => {
    captureStats.errors += 1;
  },
});

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
    skippedDumps: 0,
    failedDumpRequests: 0,
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

// A failed request dumps nothing, so the cut's backend code lands in the next dump.
function markDumpFailed(attempt, step) {
  captureStats.errors += 1;
  if (attempt === attemptId && !stepsClosed && steps[step]) {
    steps[step].dumpFailed = true;
    captureStats.failedDumpRequests += 1;
  }
}

// Fire-and-forget, so the command queue never waits on the backend.
function requestBackendDump(step, seq) {
  captureStats.dumpRequests += 1;
  const attempt = attemptId;
  try {
    fetch(
      `${stepDumpUrl}?attempt=${attemptId}&step=${step}&seq=${seq}&sent=${Date.now()}`,
      {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
      },
    ).catch(() => {
      markDumpFailed(attempt, step);
    });
  } catch {
    markDumpFailed(attempt, step);
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
        counters.track(win);
      }
    } catch {
      // A cross-origin app window has no readable counters.
      captureStats.errors += 1;
    }
    const step = steps.length;
    const seq = eventSeq;
    const cut = {
      seq,
      trigger,
      triggerSeq,
      t: Math.round(started - testStartedAt),
      phase: currentPhase(),
      url: currentPath(),
      inFlight,
      f: counters.functionDeltas(stepFileIndex),
    };
    steps.push(cut);
    // The final cut gets the backend dump taken by the recordTestCapture task.
    // A cut that skips its dump leaves its backend code to the next dump.
    if (stepDumpUrl && trigger !== "end") {
      if (started - lastDumpRequestAt >= STEP_DUMP_INTERVAL_MS) {
        lastDumpRequestAt = started;
        requestBackendDump(step, seq);
      } else {
        cut.dumpSkipped = true;
        captureStats.skippedDumps += 1;
      }
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

// Tests pass `{log: false}` to keep secrets such as license tokens out of the Cypress log.
function hidesArgs(args) {
  return (args || []).some(
    (arg) =>
      arg != null &&
      typeof arg === "object" &&
      !Array.isArray(arg) &&
      arg.log === false,
  );
}

// A `cy.request` can carry secrets in its body, headers and query string, so its chain text has only the method and path.
function requestText(args) {
  const target = requestTarget(args || []);
  const route = target ? parseRoute(target[1]) : null;
  if (!route) {
    return "request(<unparsed>)";
  }
  const method = isHttpMethod(target[0])
    ? String(target[0]).toUpperCase()
    : "<method>";
  return `request(${method} ${route.target})`;
}

function commandText(name, args) {
  if (hidesArgs(args)) {
    return `${name}(${args.map(() => "<hidden>").join(", ")})`;
  }
  if (name === "request") {
    return requestText(args);
  }
  // A task's argument can hold secrets like a signing key, so it is recorded masked in the event's own fields.
  if (name === "task") {
    return `task(${summarizeArg(args?.[0])})`;
  }
  return `${name}(${(args || []).map(summarizeArg).join(", ")})`;
}

// A task's argument and a stub's static reply, as the fields of their command event.
function setupFields(name, args) {
  if (name !== "task" && name !== "intercept") {
    return {};
  }
  if (hidesArgs(args)) {
    return name === "task" ? { argType: "hidden" } : { replyType: "hidden" };
  }
  if (name === "task") {
    return bodyFields(() => payloadFields(args[1], "arg"));
  }
  const reply = interceptReplyArg(args, isHttpMethod);
  if (typeof reply === "function") {
    return { replyType: "handler" };
  }
  return bodyFields(() => payloadFields(reply, "reply"));
}

// The commands of one `cy.a().b().should()` chain share a chainerId.
function chainOf(command) {
  const chainerId = command?.get?.("chainerId");
  const parts = [];
  let current = command;
  while (
    current &&
    current.get("chainerId") === chainerId &&
    parts.length < MAX_CHAIN_COMMANDS
  ) {
    parts.unshift(commandText(current.get("name"), current.get("args")));
    current = current.get("prev");
  }
  return parts.join(".");
}

// Cypress keeps the JS stack from when a command was enqueued, which still has the helper frames.
// The spec bundle is not minified, so frame names are the helper function names.
const SPEC_BUNDLE_FRAME =
  /at (?:async )?([\w$.]+) \((?:[^)]*__cypress\/tests[^)]*)\)/;
const SPEC_BUNDLE_POSITION = /__cypress\/tests\?p=([^:)\s]+):(\d+):(\d+)/;

function helpersOfStack(stack) {
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

function helpersOf(command) {
  return helpersOfStack(command?.get?.("userInvocationStack"));
}

// Every command of a chain, with the `.should()` commands that Cypress runs inside the previous command and never starts.
function chainOfChainer(chainerId) {
  const commands = chainCommands.get(chainerId);
  if (!commands) {
    return null;
  }
  return {
    chain: commands
      .map((attrs) => commandText(attrs.name, attrs.args))
      .join("."),
    helpers: helpersOfStack(commands[0].userInvocationStack),
  };
}

// Cypress keeps the stack of the latest expect() or assert() call in `currentAssertionUserInvocationStack`.
// While that call logs its assertion,
// the stack's first spec-bundle frame is where the assertion is written.
function assertionCallSite() {
  try {
    const stack = cy.state("currentAssertionUserInvocationStack");
    const frame =
      typeof stack === "string"
        ? stack.split("\n").find((line) => line.includes("__cypress/tests"))
        : undefined;
    if (!frame) {
      return undefined;
    }
    const source = Cypress.stackUtils?.getSourceDetailsForFirstLine?.(
      frame,
      Cypress.config("projectRoot"),
    );
    const file = source?.relativeFile || source?.originalFile;
    if (file && source.line != null) {
      return { file, line: source.line, column: source.column };
    }
    const position = frame.match(SPEC_BUNDLE_POSITION);
    return position
      ? {
          bundle: position[1],
          line: Number(position[2]),
          column: Number(position[3]),
        }
      : undefined;
  } catch {
    captureStats.errors += 1;
    return undefined;
  }
}

// A body that fails to encode still leaves its request event recorded.
function bodyFields(read) {
  try {
    return read();
  } catch {
    captureStats.errors += 1;
    return {};
  }
}

function isHttpMethod(value) {
  return HTTP_METHODS.has(String(value).toUpperCase());
}

function isCaptureCommand(command) {
  const name = command.get("name");
  const first = command.get("args")?.[0];
  return (
    (name === "task" && HARNESS_TASKS.has(first)) ||
    (name === "intercept" && first === captureRoute)
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
    assertCallSites = new Map();
    commandSeqs = new WeakMap();
    chainCommands = new Map();
    lastDumpRequestAt = -Infinity;
    captureStats = newCaptureStats();
    if (stepLevel > 0) {
      counters.resetPreviousCounts();
    }
  });

  // Every app page load, including ones triggered inside suite-level
  // before() hooks. At load time all synchronously-executed instrumented
  // chunks have registered, so __coverage__ exists.
  Cypress.on("window:load", (win) => counters.track(win));

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
    captureRoute = { pathname: INTERCEPTED_PATHS, middleware: true };
    // middleware: true observes and passes through, so this coexists with the
    // specs' own cy.intercept stubs/waits without changing any behavior.
    cy.intercept(captureRoute, (req) => {
      recordRoute(
        req.method,
        req.url,
        `proxy:${req.resourceType}`,
        journeyCapture
          ? bodyFields(() => proxyBodyFields(req.body, req.headers))
          : undefined,
      );
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
        const chainerId = command.get("chainerId");
        if (name === "request") {
          const args = command.get("args") || [];
          const target = requestTarget(args);
          const details = {
            helpers: helpersOf(command),
            chainerId,
            ...(hidesArgs(args)
              ? { bodyType: "hidden" }
              : bodyFields(() =>
                  requestBodyFields(requestBodyArg(args, isHttpMethod)),
                )),
          };
          const seq = target
            ? recordRoute(target[0], target[1], "cy.request", details)
            : null;
          commandSeqs.set(
            command,
            seq ??
              recordEvent("request", {
                initiator: "cy.request",
                method: null,
                path: null,
                ...details,
              }),
          );
          return;
        }
        commandSeqs.set(
          command,
          recordEvent("command", {
            name,
            chainerId,
            chain: chainOf(command),
            helpers: helpersOf(command),
            ...setupFields(name, command.get("args") || []),
          }),
        );
      }),
    );

    Cypress.on(
      "command:enqueued",
      guarded((attrs) => {
        const chainerId = attrs?.chainerId;
        if (chainerId == null) {
          return;
        }
        const commands = chainCommands.get(chainerId);
        if (!commands) {
          chainCommands.set(chainerId, [attrs]);
        } else if (commands.length < MAX_CHAIN_COMMANDS) {
          commands.push(attrs);
        }
      }),
    );

    // `.should()` and `expect()` both log with name "assert",
    // and Cypress gives the log the chainerId of the command running when it is created.
    // A retried `.should()` ends its log once, when it finally passes or fails, and that is the moment recorded.
    const onAssertLog = (attrs, added) => {
      if (attrs.name !== "assert" || endedAssertLogs.has(attrs.id)) {
        return;
      }
      const ended = attrs.ended || (attrs.state && attrs.state !== "pending");
      // Only log:added runs inside the expect() call that made the log, which is when its call site is readable.
      const callSite = added
        ? assertionCallSite()
        : assertCallSites.get(attrs.id);
      if (!ended) {
        if (added) {
          assertCallSites.set(attrs.id, callSite);
        }
        return;
      }
      endedAssertLogs.add(attrs.id);
      assertCallSites.delete(attrs.id);
      const fromChainer =
        attrs.chainerId != null ? chainOfChainer(attrs.chainerId) : null;
      const current = fromChainer ? null : cy.state("current");
      const seq = recordEvent("assert", {
        state: attrs.state,
        message: clip(attrs.message ?? ""),
        chainerId: attrs.chainerId,
        chain: fromChainer ? fromChainer.chain : chainOf(current),
        helpers: fromChainer ? fromChainer.helpers : helpersOf(current),
        ...(!fromChainer && { chainSource: "current" }),
        callSite,
      });
      if (stepLevel >= STEP_LEVELS.assertions) {
        takeStep("assert", seq);
      }
    };
    Cypress.on(
      "log:added",
      guarded((attrs) => onAssertLog(attrs, true)),
    );
    Cypress.on(
      "log:changed",
      guarded((attrs) => onAssertLog(attrs, false)),
    );

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
      const branchHits = journeyCapture ? {} : null;
      const f = counters.collectAndZero(win, branchHits);
      if (journeyCapture) {
        try {
          journey.branchHits = flattenBranchHits(branchHits);
        } catch {
          captureStats.errors += 1;
        }
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
