import { format } from "util";

import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import fetchMock from "fetch-mock";

const REACT_KEY_WARNING_PATTERNS = [
  /Each child in a list should have a unique "key" prop/,
  /Encountered two children with the same key/,
];

const reactKeyWarnings = [];
const originalConsoleError = console.error;

// Throwing here would land inside React's render, where an error boundary can
// swallow it, so the warnings are collected and reported after the test.
console.error = (...args) => {
  originalConsoleError(...args);

  const [template] = args;
  const isReactKeyWarning =
    typeof template === "string" &&
    REACT_KEY_WARNING_PATTERNS.some((pattern) => pattern.test(template));

  if (isReactKeyWarning) {
    reactKeyWarnings.push(format(...args));
  }
};

afterEach(() => {
  const warnings = reactKeyWarnings.splice(0);

  if (warnings.length > 0) {
    throw new Error(
      `Test completed with React key warnings:\n${warnings.join("\n")}`,
    );
  }
});

// jsdom has no layout, so popover positioning computes nothing useful while
// costing getComputedStyle calls and an extra re-render per position update.
jest.mock("@floating-ui/dom", () => ({
  ...jest.requireActual("@floating-ui/dom"),
  computePosition: (_reference, _floating, options = {}) =>
    Promise.resolve({
      x: 0,
      y: 0,
      placement: options.placement ?? "bottom",
      strategy: options.strategy ?? "absolute",
      middlewareData: {},
    }),
  autoUpdate: (_reference, _floating, update) => {
    update();
    return () => {};
  },
}));

// Mock clipboard API for tests
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve()),
  },
});

beforeEach(() => {
  fetchMock.mockGlobal();
  // Always mock the error reporting endpoint — it's fire-and-forget
  // and should never affect test behavior
  fetchMock.post("path:/api/frontend-errors", 200);
});

afterEach(async () => {
  // Cleanup React components FIRST to trigger any unmount effects
  cleanup();

  delete window.MetabaseBootstrap;
  // Wait for any pending fetch requests to complete
  await fetchMock.callHistory.flush();

  // Fail the test if there were any unmocked routes
  const calls = fetchMock.callHistory.calls();
  const unmatched = calls.filter((call) => !call.route);

  // ensure we always reset, even if there were unmatched calls
  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();

  if (unmatched.length > 0) {
    const errors = unmatched.map(
      (call) => `Unmocked ${call.options.method} request to: ${call.url}`,
    );
    throw new Error(
      `Test completed with unmocked routes:\n${errors.join("\n")}`,
    );
  }
});
