import "@testing-library/jest-dom";
import fetchMock from "fetch-mock";

beforeEach(() => {
  fetchMock.mockGlobal();
  fetchMock.catch((url, opts) => {
    const requestUrl = url?.url || url;
    const method = opts?.method || "GET";

    console.error(`Unmocked ${method} request to: ${requestUrl}`);
    throw new Error(`Unmocked ${method} request to: ${requestUrl}`);
  });
});

afterEach(() => {
  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();
});
