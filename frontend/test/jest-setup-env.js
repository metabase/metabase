import fetchMock from "fetch-mock";

beforeEach(() => {
  fetchMock.restore();
  fetchMock.catch((url, ...args) => {
    console.log("CATCH FETCH MOCK");
    console.log(url, args);

    for (const [url, response] of Object.entries(CUSTOM_RESPONSES)) {
      if (url.startsWith(url)) {
        return response;
      }
    }

    return {};
  });
});

const CUSTOM_RESPONSES = {
  "http://localhost/api/database": { data: [] },
};
