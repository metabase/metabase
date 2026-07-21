/**
 * Per-test usage capture for the nightly instrumented e2e runs.
 *
 * For every test (attempt) this records:
 *  - the API routes it touched: app traffic (fetch/XHR) via a pass-through
 *    middleware intercept plus fetch/XHR wrappers installed on every app
 *    window, and setup traffic issued through cy.request (helpers like
 *    H.createQuestion never hit cy.intercept because they go through the
 *    Cypress server, not the browser).
 *  - which instrumented functions fired, computed node-side as the delta of
 *    the accumulated Istanbul counters between tests (recordTestCapture in
 *    e2e/support/config.js).
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
 * afterEach, which drains window.__coverage__ into the node-side accumulator.
 * That holds because this module is imported after
 * "@cypress/code-coverage/support" in e2e/support/cypress.js and root-level
 * hooks run in registration order.
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
    const routes = [...new Set(routeBuffer)].sort();
    routeBuffer = [];
    cy.task(
      "recordTestCapture",
      { title: this.currentTest.fullTitle(), routes },
      { log: false },
    );
  });
}
