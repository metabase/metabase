import fetchMock from "fetch-mock";

beforeEach(() => {
  fetchMock.restore();
  fetchMock.catch((url, ...args) => {
    console.log("CATCH FETCH MOCK");
    console.log(url, args);

    for (const customRule of Object.entries(CUSTOM_RESPONSES)) {
      if (url.startsWith(customRule[0])) {
        return customRule[1];
      }
    }

    return {};
  });
});

const CUSTOM_RESPONSES = {
  "http://localhost/api/database": { data: [] },
};
