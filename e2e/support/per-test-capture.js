/**
 * Per-test usage capture for the nightly instrumented e2e runs.
 *
 * For every test (attempt) this records:
 *  - the API routes it touched: app traffic (fetch/XHR) via a pass-through
 *    middleware intercept, plus setup traffic issued through cy.request
 *    (helpers like H.createQuestion never hit cy.intercept because they go
 *    through the Cypress server, not the browser).
 *  - which instrumented functions fired, computed node-side as the delta of
 *    the accumulated Istanbul counters between tests (recordTestCapture in
 *    e2e/support/config.js).
 *
 * The afterEach flush below MUST run after @cypress/code-coverage's own
 * afterEach, which drains window.__coverage__ into the node-side accumulator.
 * That holds because this module is imported after
 * "@cypress/code-coverage/support" in e2e/support/cypress.js and root-level
 * hooks run in registration order.
 *
 * Known attribution gaps, all acceptable for manifest purposes: app traffic
 * during a suite-level before() escapes the intercept (it is registered per
 * test in beforeEach), and requests from hooks attribute to the surrounding
 * test:before:run/afterEach window.
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

if (isInstrumented) {
  // Fires once per attempt, before any of the attempt's hooks.
  Cypress.on("test:before:run", () => {
    routeBuffer = [];
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
