import { delay } from "metabase/lib/promise";
import { BackgroundJobRequest } from "metabase/lib/request";

describe("request API", () => {
  xdescribe("RestfulRequest", () => {
    // NOTE Atte Keinänen 9/26/17: RestfulRequest doesn't really need unit tests because the xrays integration tests
    // basically already verify that the basic functionality works as expected, as in
    // * Are actions executed in an expected order and do they lead to expected state changes
    // * Does the promise returned by  `trigger(params)` resolve after the request has completed (either success or failure)
    // * Does `reset()` reset the request state properly
  });

  // We don't simulate localStorage in React container tests so stuff regarding reusing existing job IDs is tested here
  // NOTE: Writing some of these tests might become obsolete if we come up with a more backend-leaning caching strategy
  xdescribe("BackgroundJobRequest", () => {
    const createTestRequest = () =>
      new BackgroundJobRequest({
        creationEndpoint: async () => {
          await delay(500);
          return { "job-id": 57 };
        },
        // how should we manipulate what statusEndpoint retuns? maybe just a simple variable? it's a little awkward though :/
        statusEndpoint: async () => {
          await delay(500);
          return { status: "done", result: {} };
        },
        actionPrefix: "test",
      });

    describe("trigger(params)", () => {
      it("should create a new job when calling `trigger(params)` for a first time", () => {
        const testRequest = createTestRequest();
        testRequest.trigger({ id: "1" });
      });

      it("should restore results of an existing job when calling `trigger(params)` another time", () => {
        const testRequest = createTestRequest();
        testRequest.trigger({});
      });

      it("should create a new job ", () => {
        // const testrequest = createTestRequest()
      });
    });
  });
});
