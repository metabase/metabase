const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface FetchWithRetryInit extends RequestInit {
  /** Number of *retries*, so `3` means up to 4 total requests. */
  retries?: number;
  /** First backoff window in ms; doubles each attempt. */
  baseDelay?: number;
  /** Upper bound on a single backoff window in ms. */
  maxDelay?: number;
  /** Per-attempt timeout in ms. */
  timeout?: number;
  /** Decide whether a completed response is worth retrying. */
  shouldRetry?: (res: Response) => boolean;
}

/**
 * fetch() with exponential backoff + jitter.
 * Retries on network errors, timeouts, and retryable status codes.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  {
    retries = 3,
    baseDelay = 300,
    maxDelay = 10_000,
    timeout = 10_000,
    shouldRetry = (res) => RETRYABLE_STATUS.has(res.status),
    ...init
  }: FetchWithRetryInit = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetch(input, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)])
          : AbortSignal.timeout(timeout),
      });
      if (!shouldRetry(res) || attempt === retries) {return res;}
      res.body?.cancel().catch(() => {}); // don't leak the discarded stream
    } catch (err) {
      // caller cancelled, or we're out of attempts
      if (init.signal?.aborted || attempt === retries) {throw err;}
    }

    await sleep(retryAfter(res) ?? backoff(attempt, baseDelay, maxDelay), init.signal);
  }
}

function backoff(attempt: number, base: number, max: number): number {
  const ceiling = Math.min(base * 2 ** attempt, max);
  return ceiling / 2 + Math.random() * (ceiling / 2); // half-jittered
}

function retryAfter(res: Response | undefined): number | null {
  const header = res?.headers.get('retry-after');
  if (!header) {return null;}
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return ms > 0 ? ms : null;
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {return reject(signal.reason);}

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
