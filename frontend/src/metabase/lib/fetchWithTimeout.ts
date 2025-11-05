const DEFAULT_TIMEOUT = 7000;

/* wrapper around fetch that allows passing a timeout prop */
export function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, options?.timeout || DEFAULT_TIMEOUT);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  })
    .then((res) => {
      clearTimeout(timeout);
      return res;
    })
    .catch((err: Error) => {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        throw new Error(`Request tp ${url} timed out`);
      }
      throw new Error(err.message || "error fetching");
    });
}
