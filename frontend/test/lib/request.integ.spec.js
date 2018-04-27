import { delay } from "metabase/lib/promise";

describe("request API", () => {
  xdescribe("RestfulRequest", () => {
    // NOTE Atte Keinänen 9/26/17: RestfulRequest doesn't really need unit tests because the xrays integration tests
    // basically already verify that the basic functionality works as expected, as in
    // * Are actions executed in an expected order and do they lead to expected state changes
    // * Does the promise returned by  `trigger(params)` resolve after the request has completed (either success or failure)
    // * Does `reset()` reset the request state properly
  });

});
