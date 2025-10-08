import "@testing-library/jest-dom";
import fetchMock from "fetch-mock";

beforeEach(() => {
  fetchMock.mockGlobal();
});

afterEach(() => {
  // Fail the test if there were any unmocked routes
  const calls = fetchMock.callHistory.calls();
  const unmatched = calls.filter((call) => !call.route);
  if (unmatched.length > 0) {
    const errors = unmatched.map(
      (call) => `Unmocked ${call.options.method} request to: ${call.url}`,
    );
    throw new Error(
      `Test completed with unmocked routes:\n${errors.join("\n")}`,
    );
  }

  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();
});
