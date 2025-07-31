import "@testing-library/jest-dom";
import fetchMock from "fetch-mock";

fetchMock.config.fallbackToNetwork = false;

afterEach(() => {
  fetchMock.restore();
  fetchMock.catch((url, request) => {
    const errorMessage = `Caught unmocked ${request.method} request to: ${url}`;

    Promise.reject(errorMessage);

    // consider all not mocked requests are broken
    return 500;
  });
});
