import "@testing-library/jest-dom";
import fetchMock from "fetch-mock";

beforeEach(() => {
  fetchMock.mockGlobal();
  fetchMock.catch((request) => {
    const { url, options } = request;

    console.error(`Unmocked ${options.method} request to: ${url}`);
    throw new Error(`Unmocked ${options.method} request to: ${url}`);
  });
});

afterEach(() => {
  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();
});
