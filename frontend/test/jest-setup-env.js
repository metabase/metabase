import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import fetchMock from "fetch-mock";

// Mock clipboard API for tests
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve()),
  },
});

beforeEach(() => {
  fetchMock.mockGlobal();
});

afterEach(async () => {
  // Cleanup React components FIRST to trigger any unmount effects
  cleanup();
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
