import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import fetchMock from "fetch-mock";

// jsdom has no layout, so popover positioning computes nothing useful while
// costing getComputedStyle calls and an extra re-render per position update.
jest.mock("@floating-ui/dom", () => ({
  ...jest.requireActual("@floating-ui/dom"),
  // The caller asks for a position from a layout effect and applies the result
  // with flushSync. Answered on the spot, that flushSync runs while React is
  // still rendering, and React logs a warning. Answered from a plain promise,
  // the state update lands outside act(), and React logs a different one. So
  // the answer comes a microtask later, inside an act() scope of its own.
  computePosition: (_reference, _floating, options = {}) => ({
    then: (onFulfilled) => {
      const position = {
        x: 0,
        y: 0,
        placement: options.placement ?? "bottom",
        strategy: options.strategy ?? "absolute",
        middlewareData: {},
      };
      queueMicrotask(() => {
        // act() itself warns where the environment is not set up for it, which
        // is the case inside Testing Library's async helpers.
        if (globalThis.IS_REACT_ACT_ENVIRONMENT) {
          jest.requireActual("react-dom/test-utils").act(() => {
            onFulfilled(position);
          });
        } else {
          onFulfilled(position);
        }
      });
    },
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
