import fetchMock from "fetch-mock";

afterEach(() => {
  fetchMock.restore();
});
