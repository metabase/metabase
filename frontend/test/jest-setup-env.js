import "@testing-library/jest-dom";
import fetchMock from "fetch-mock";

// Fail tests on any unmocked fetch requests
// errors in fetchMock.catch don't fail the test immediately, so we need to
// collect them and fail the test in afterEach
let unmockedRouteErrors = [];

beforeEach(() => {
  unmockedRouteErrors = [];
  fetchMock.mockGlobal();
  fetchMock.catch((request) => {
    const url = request.url || request;
    const method = request.options?.method || request.method || "GET";
    const errorMessage = `Unmocked ${method} request to: ${url}`;
    unmockedRouteErrors.push(errorMessage);
    throw new Error(errorMessage);
  });
});

afterEach(() => {
  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();

  // Fail the test if there were any unmocked routes
  if (unmockedRouteErrors.length > 0) {
    const errors = unmockedRouteErrors.join("\n");
    unmockedRouteErrors = [];
    throw new Error(`Test completed with unmocked routes:\n${errors}`);
  }
});
