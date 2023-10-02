import fetchMock from "fetch-mock";

beforeEach(() => {
  fetchMock.restore();
  fetchMock.catch((url, ...args) => {
    console.error("Caught unmocked request to url: ", url);
    console.warn(args);

    // consider all unmocked requests are broken
    return 500;
  });
});
