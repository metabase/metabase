import "@testing-library/jest-dom";
import fetchMock from "fetch-mock";

beforeEach(() => {
  fetchMock.restore();
  fetchMock.catch((url, request) => {
    const errorMessage = `Caught unmocked ${request.method} request to: ${url}`;

    Promise.reject(errorMessage);

    // consider all not mocked requests are broken
    return 500;
  });

  // used for detecting top level ttag calls
  global.isTopLevel = false;
});

afterEach(() => {
  // used for detecting top level ttag calls
  global.isTopLevel = true;
});
