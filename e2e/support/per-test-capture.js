/**
 * Per-test usage capture for the nightly instrumented e2e runs.
 *
 * For every test (attempt) this records:
 *  - the API routes it touched: app traffic (fetch/XHR) via a pass-through
 *    middleware intercept plus fetch/XHR wrappers installed on every app
 *    window, and setup traffic issued through cy.request (helpers like
 *    H.createQuestion never hit cy.intercept because they go through the
 *    Cypress server, not the browser).
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
// micro, ...), which we drop.
const RELATIVE_ORIGIN = "http://relative.invalid";

let routeBuffer = [];

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

function recordRoute(method, url) {
  if (typeof url !== "string") {
    return;
  }
  let parsed;
  try {
    parsed = new URL(url, RELATIVE_ORIGIN);
  } catch {
    return;
  }
  if (
    !isInternalOrigin(parsed.origin) ||
    !parsed.pathname.startsWith("/api/")
  ) {
    return;
  }
  routeBuffer.push(`${String(method).toUpperCase()} ${parsed.pathname}`);
}

// Mirrors how Cypress itself disambiguates cy.request(url), cy.request(url,
// body), cy.request(method, url[, body]) and cy.request(options).
function recordRequestArgs(args) {
  const [first, second] = args;
  if (first != null && typeof first === "object") {
    recordRoute(first.method || "GET", first.url);
  } else if (
    typeof second === "string" &&
    HTTP_METHODS.has(String(first).toUpperCase())
  ) {
    recordRoute(first, second);
  } else if (typeof first === "string") {
    recordRoute("GET", first);
  }
}

// Records a fetch() call. `input` is fetch's first argument (string, URL, or
// Request); per the fetch spec an explicit init.method overrides a Request's.
function recordFetchArgs(win, input, init) {
  if (input instanceof win.Request) {
    recordRoute(init?.method || input.method || "GET", input.url);
  } else {
    recordRoute(init?.method || "GET", String(input));
  }
}

if (isInstrumented) {
  // Fires once per attempt, before any of the attempt's hooks.
  Cypress.on("test:before:run", () => {
    routeBuffer = [];
  });

  // Every app page load, including ones triggered inside suite-level
  // before() hooks. At load time all synchronously-executed instrumented
  // chunks have registered, so __coverage__ exists.
  Cypress.on("window:load", trackCoverage);

  Cypress.on("window:before:load", (win) => {
    const originalFetch = win.fetch;
    win.fetch = function (input, init) {
      try {
        recordFetchArgs(win, input, init);
      } catch {
        // Recording must never break the app's request.
      }
      return originalFetch.apply(this, arguments);
    };

    const originalOpen = win.XMLHttpRequest.prototype.open;
    win.XMLHttpRequest.prototype.open = function (method, url) {
      try {
        recordRoute(method, String(url));
      } catch {
        // Recording must never break the app's request.
      }
      return originalOpen.apply(this, arguments);
    };
  });

  beforeEach(() => {
    // middleware: true observes and passes through, so this coexists with the
    // specs' own cy.intercept stubs/waits without changing any behavior.
    cy.intercept({ pathname: "/api/**", middleware: true }, (req) => {
      recordRoute(req.method, req.url);
    });
  });

  Cypress.Commands.overwrite("request", (originalFn, ...args) => {
    recordRequestArgs(args);
    return originalFn(...args);
  });

  afterEach(function () {
    const title = this.currentTest.fullTitle();
    const routes = [...new Set(routeBuffer)].sort();
    routeBuffer = [];
    cy.window({ log: false }).then((win) => {
      const f = collectAndZeroFunctionCounts(win);
      return cy.task("recordTestCapture", { title, f, routes }, { log: false });
    });
  });
}
