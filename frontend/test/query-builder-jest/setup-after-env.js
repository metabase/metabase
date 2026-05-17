// @ts-nocheck
/* eslint-disable import/no-commonjs */

/**
 * Minimal `setupFilesAfterEnv` entry for the standalone query_builder Jest
 * project. Written from scratch — does not reuse frontend/test/jest-setup-env.js.
 */
import "@testing-library/jest-dom";
import fetchMock from "fetch-mock";

const cleanup =
  typeof document === "undefined"
    ? () => {}
    : require("@testing-library/react").cleanup;

if (typeof navigator !== "undefined") {
  Object.assign(navigator, {
    clipboard: {
      writeText: jest.fn(() => Promise.resolve()),
    },
  });
}

beforeEach(() => {
  fetchMock.mockGlobal();
  fetchMock.post("path:/api/frontend-errors", 200);
});

function clearCljsAnalyticsInterval() {
  const analyticsImpl = globalThis.metabase?.analytics?.impl;
  const interval = analyticsImpl?._interval;

  if (interval) {
    clearInterval(interval);
    analyticsImpl._interval = undefined;
  }
}

afterEach(async () => {
  cleanup();
  clearCljsAnalyticsInterval();
  await fetchMock.callHistory.flush();

  const unmatched = fetchMock.callHistory.calls().filter((call) => !call.route);

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

afterAll(() => {
  clearCljsAnalyticsInterval();
});
