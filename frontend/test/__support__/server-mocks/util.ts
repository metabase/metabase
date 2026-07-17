import fetchMock from "fetch-mock";

export function setupPasswordCheckEndpoint() {
  fetchMock.post("path:/api/session/password-check", 204);
}

type ResponseInfo = {
  url: string;
  body: any;
};

const fakeTimersEnabled = () =>
  typeof jest !== "undefined" &&
  // Cast: fake-timer implementations stamp marker properties (jest's
  // _isMockFunction, sinon's clock) onto setTimeout; they aren't in its type.
  ((setTimeout as any)._isMockFunction === true ||
    Object.prototype.hasOwnProperty.call(setTimeout, "clock"));

// True only when the fast-test regime (fast-user-event.ts) faked the clock
// for this file. Specs that call jest.useFakeTimers() themselves keep the
// stock 1s waitFor budget, which a 510ms advance per poll would exhaust in
// two iterations — so the advance below must not apply to them.
const regimeManaged = () =>
  // Cast: the regime flag is an ad-hoc global set by fast-user-event.ts.
  (globalThis as Record<string, unknown>).__FAST_TESTS_REGIME__ === true;

export async function findRequests(
  method: "PUT" | "POST" | "GET" | "DELETE",
): Promise<ResponseInfo[]> {
  // Requests behind a debounce/setTimeout haven't been issued yet when the
  // clock is faked; run pending timers so they fire before we inspect history.
  if (regimeManaged() && fakeTimersEnabled()) {
    // Bounded advance: enough to fire debounced saves, without leaping to
    // far-future timers (polling intervals) the way runOnlyPendingTimers would.
    await jest.advanceTimersByTimeAsync(510);
  }
  // Ensure all async call history is complete
  await fetchMock.callHistory.flush();

  const calls = fetchMock.callHistory.calls();
  const filteredCalls = calls.filter((call) => call.request?.method === method);

  return Promise.all(
    filteredCalls.map(async (call) => {
      let bodyText = "";

      // Try to get body from options first, then from request
      if (call.options?.body) {
        bodyText = call.options.body.toString();
      } else if (call.request?.body && !call.request.bodyUsed) {
        bodyText = await call.request.clone().text();
      }

      return {
        url: call.url || "",
        body: bodyText ? JSON.parse(bodyText) : {},
      };
    }),
  );
}
