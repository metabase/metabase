import fetchMock from "fetch-mock";

beforeEach(() => {
  fetchMock.restore();
  fetchMock.catch((url, request) => {
    const errorMessage = `Caught not mocked ${request.method} request to: ${url}`;

    Promise.reject(errorMessage);

    // consider all not mocked requests are broken
    return 500;
  });
});
