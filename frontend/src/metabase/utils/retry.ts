import { delay } from "metabase/utils/promise";

export type RetryOptions = {
  /**
   * Maximum number of retries after the initial attempt.
   * Total attempts will be `maxRetries + 1`.
   */
  maxRetries: number;
  /**
   * Predicate that decides whether to retry. Receives the error and the
   * 0-indexed attempt number that just failed (0 = first attempt failed).
   */
  shouldRetry: (error: unknown, attempt: number) => boolean;
  /**
   * Milliseconds to wait before the next retry. Receives the 0-indexed
   * attempt number that just failed. Defaults to `exponentialBackoff()`
   * (1s, 2s, 4s, 8s, ...).
   */
  delayMs?: (attempt: number) => number;
  /**
   * When provided, aborting short-circuits the loop: an in-flight backoff
   * wait ends early and the loop throws the signal's abort reason (an
   * `AbortError` by default) instead of making another attempt. An
   * already-aborted signal throws before `fn` is ever called.
   */
  signal?: AbortSignal;
};

/**
 * Exponential backoff schedule: `baseMs * 2^attempt`.
 * With the default base of 1000ms produces 1s, 2s, 4s, 8s, ...
 */
export function exponentialBackoff(
  baseMs: number = 1000,
): (attempt: number) => number {
  return (attempt) => baseMs * Math.pow(2, attempt);
}

const DEFAULT_DELAY_MS = exponentialBackoff();

/**
 * Run `fn()` with retries.
 *
 * On error, asks `shouldRetry(error, attempt)`. If true and the retry budget
 * allows, waits `delayMs(attempt)` and tries again. Otherwise rethrows.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  { maxRetries, shouldRetry, delayMs = DEFAULT_DELAY_MS, signal }: RetryOptions,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    // Bail before each attempt if aborted — including right after an
    // interrupted backoff — rather than making another call to `fn`.
    signal?.throwIfAborted();
    try {
      return await fn();
    } catch (error) {
      if (!shouldRetry(error, attempt) || attempt >= maxRetries) {
        throw error;
      }
      await delay(delayMs(attempt), signal);
    }
  }
}
