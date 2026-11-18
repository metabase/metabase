import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { fetchWithRetry } from "./fetchWithRetry.ts";

const url = "https://example.test/thing";

const status = (code: number, headers: Record<string, string> = {}) =>
  new Response("", { status: code, headers });
const dropped = () =>
  new Error("The socket connection was closed unexpectedly");

function stubFetch(outcomes: readonly (Response | Error)[]) {
  let index = 0;
  const serve = async () => {
    const outcome = outcomes[index++];
    if (outcome === undefined) {
      throw new Error("fetch was called more often than the test expected");
    }
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  };
  const { preconnect } = globalThis.fetch;
  return spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(serve, { preconnect }),
  );
}

function recordDelays() {
  const spy = spyOn(globalThis, "setTimeout");
  return () => spy.mock.calls.map(([, delay]) => delay);
}

afterEach(() => {
  mock.restore();
});

describe("fetchWithRetry", () => {
  it("returns the first response without retrying when it is ok", async () => {
    const fetchSpy = stubFetch([status(200)]);

    const res = await fetchWithRetry(url, { retries: 2, baseDelay: 1 });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries a dropped connection and returns a later response", async () => {
    const fetchSpy = stubFetch([dropped(), dropped(), status(200)]);

    const res = await fetchWithRetry(url, { retries: 2, baseDelay: 1 });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("throws the last error once every attempt has failed", async () => {
    const last = dropped();
    const fetchSpy = stubFetch([dropped(), dropped(), last]);

    await expect(
      fetchWithRetry(url, { retries: 2, baseDelay: 1 }),
    ).rejects.toBe(last);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("retries a retryable status by default", async () => {
    const fetchSpy = stubFetch([status(503), status(429), status(200)]);

    const res = await fetchWithRetry(url, { retries: 2, baseDelay: 1 });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("returns the last response once the retries are used up", async () => {
    const fetchSpy = stubFetch([status(502), status(503), status(504)]);

    const res = await fetchWithRetry(url, { retries: 2, baseDelay: 1 });

    expect(res.status).toBe(504);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not retry a status outside the default retryable set", async () => {
    const fetchSpy = stubFetch([status(404), status(200)]);

    const res = await fetchWithRetry(url, { retries: 2, baseDelay: 1 });

    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("lets shouldRetry decide which responses to retry", async () => {
    const fetchSpy = stubFetch([status(404), status(200)]);

    const res = await fetchWithRetry(url, {
      retries: 2,
      baseDelay: 1,
      shouldRetry: (r) => r.status === 404,
    });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the caller has aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new Error("aborted");
    const fetchSpy = stubFetch([aborted, status(200)]);

    await expect(
      fetchWithRetry(url, {
        retries: 2,
        baseDelay: 1,
        signal: controller.signal,
      }),
    ).rejects.toBe(aborted);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("waits for Retry-After instead of its own backoff", async () => {
    stubFetch([status(503, { "retry-after": "0.01" }), status(200)]);
    const delays = recordDelays();

    await fetchWithRetry(url, { retries: 1, baseDelay: 10_000 });

    expect(delays()).toEqual([10]);
  });

  it("waits at least half of a doubling window, capped at maxDelay", async () => {
    stubFetch([status(503), status(503), status(503), status(200)]);
    spyOn(Math, "random").mockReturnValue(0);
    const delays = recordDelays();

    await fetchWithRetry(url, { retries: 3, baseDelay: 4, maxDelay: 10 });

    expect(delays()).toEqual([2, 4, 5]);
  });

  it("adds jitter on top of the half window", async () => {
    stubFetch([status(503), status(503), status(503), status(200)]);
    spyOn(Math, "random").mockReturnValue(0.5);
    const delays = recordDelays();

    await fetchWithRetry(url, { retries: 3, baseDelay: 4, maxDelay: 10 });

    expect(delays()).toEqual([3, 6, 7.5]);
  });
});
