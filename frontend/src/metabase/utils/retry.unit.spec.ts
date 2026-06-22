import { exponentialBackoff, retry } from "./retry";

describe("retry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the result on first success without retrying", async () => {
    const fn = jest.fn().mockResolvedValue("ok");

    const result = await retry(fn, {
      maxRetries: 3,
      shouldRetry: () => true,
      delayMs: () => 0,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success and returns the eventual result", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValue("third-success");

    const promise = retry(fn, {
      maxRetries: 5,
      shouldRetry: () => true,
      delayMs: () => 0,
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("third-success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rethrows immediately when shouldRetry returns false", async () => {
    const error = new Error("nope");
    const fn = jest.fn().mockRejectedValue(error);

    await expect(
      retry(fn, {
        maxRetries: 3,
        shouldRetry: () => false,
        delayMs: () => 0,
      }),
    ).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting maxRetries retries (maxRetries + 1 total attempts)", async () => {
    const error = new Error("flaky");
    const fn = jest.fn().mockRejectedValue(error);

    const promise = retry(fn, {
      maxRetries: 3,
      shouldRetry: () => true,
      delayMs: () => 0,
    });

    // Swallow the eventual rejection so jest doesn't see an unhandled rejection
    const resultPromise = promise.catch((e: unknown) => e);

    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe(error);
    // 1 initial attempt + 3 retries = 4 calls
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("passes the error and attempt index to shouldRetry", async () => {
    const shouldRetry = jest
      .fn<boolean, [unknown, number]>()
      .mockReturnValue(true);
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValue("ok");

    const promise = retry(fn, {
      maxRetries: 5,
      shouldRetry,
      delayMs: () => 0,
    });

    await jest.runAllTimersAsync();
    await promise;

    expect(shouldRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 0);
    expect(shouldRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 1);
  });

  it("defaults to exponential backoff when delayMs is omitted", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockResolvedValue("ok");

    const promise = retry(fn, {
      maxRetries: 3,
      shouldRetry: () => true,
    });

    // First retry waits 1000ms (exponentialBackoff()(0)). Before that timer
    // fires, fn should only have been called once.
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("ends the backoff early and throws the abort reason instead of retrying", async () => {
    const error = new Error("flaky");
    const fn = jest.fn().mockRejectedValue(error);
    const controller = new AbortController();

    const promise = retry(fn, {
      maxRetries: 5,
      shouldRetry: () => true,
      delayMs: () => 1000,
      signal: controller.signal,
    });
    const resultPromise = promise.catch((e: unknown) => e);

    // First attempt fails and schedules a 1000ms backoff.
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    // Aborting ends the backoff early and stops the loop without another
    // attempt; the signal's abort reason is thrown.
    controller.abort();
    await jest.runAllTimersAsync();

    const result = await resultPromise;
    expect(result).toBeInstanceOf(DOMException);
    expect((result as DOMException).name).toBe("AbortError");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws without ever calling fn when the signal is already aborted", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const controller = new AbortController();
    controller.abort();

    await expect(
      retry(fn, {
        maxRetries: 5,
        shouldRetry: () => true,
        delayMs: () => 0,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(DOMException);

    expect(fn).not.toHaveBeenCalled();
  });

  it("waits delayMs(attempt) between attempts", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValue("ok");
    const delayMs = jest.fn((attempt: number) => (attempt + 1) * 100);

    const promise = retry(fn, {
      maxRetries: 5,
      shouldRetry: () => true,
      delayMs,
    });

    await jest.runAllTimersAsync();
    await promise;

    expect(delayMs).toHaveBeenNthCalledWith(1, 0);
    expect(delayMs).toHaveBeenNthCalledWith(2, 1);
  });
});

describe("exponentialBackoff", () => {
  it("doubles each attempt with the default 1000ms base", () => {
    const delayMs = exponentialBackoff();
    expect(delayMs(0)).toBe(1000);
    expect(delayMs(1)).toBe(2000);
    expect(delayMs(2)).toBe(4000);
    expect(delayMs(9)).toBe(512_000);
  });

  it("accepts a custom base", () => {
    const delayMs = exponentialBackoff(50);
    expect(delayMs(0)).toBe(50);
    expect(delayMs(1)).toBe(100);
    expect(delayMs(4)).toBe(800);
  });
});
