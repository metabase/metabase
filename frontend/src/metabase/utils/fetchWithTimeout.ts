const DEFAULT_TIMEOUT = 7000;

type RequestInitWithTimeout = Omit<RequestInit, "signal"> & {
  timeout?: number;
};

/**
 * Fetches a URL with a timeout.
 *
 * TODO(romeovs): should use AbortSignal.timeout instead?
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInitWithTimeout,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, options?.timeout || DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw new Error(`Request tp ${url} timed out`);
      }
      throw new Error(err.message);
    }
    throw new Error("error fetching");
  } finally {
    clearTimeout(timeout);
  }
}
