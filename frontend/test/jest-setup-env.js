import fetchMock from "fetch-mock";
// jest overrides global.console, it's a workaround to show errors in silent mode (e.g. at CI)
import * as console from "console";

beforeEach(() => {
  fetchMock.restore();
  fetchMock.catch((url, ...args) => {
    console.error("Caught not mocked request to url: ", url);
    console.warn(args);

    // consider all not mocked requests are broken
    return 500;
  });
});
