import { recordDevDiagnostic } from "../components/DevToolbar/diagnostics";

let installed = false;

const resolveUrl = (input: RequestInfo | URL): URL | null => {
  try {
    if (typeof input === "string" || input instanceof URL) {
      return new URL(String(input), window.location.href);
    }

    return new URL(input.url, window.location.href);
  } catch {
    return null;
  }
};

const resolveMethod = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): string => {
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET");

  return method.toUpperCase();
};

/** Metabase reports API errors as `{ message }`; anything else reads better raw. */
const readErrorMessage = (text: string): string => {
  try {
    const body: unknown = JSON.parse(text);

    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
    ) {
      return body.message;
    }
  } catch {
    // Not JSON — a proxy's HTML error page, or a bare string.
  }

  return text;
};

/**
 * The status code alone doesn't say what went wrong, and without the reason the
 * feed can only report *that* a query failed. Only failures are read: they are
 * rare and small, whereas cloning successful responses would download every
 * query result twice. The clone is what keeps the body readable by the caller.
 * Length is bounded by `recordDevDiagnostic`, which caps every string field.
 */
const captureFailureReason = async (
  response: Response,
): Promise<string | undefined> => {
  if (response.ok) {
    return undefined;
  }

  try {
    const text = await response.clone().text();

    return text ? readErrorMessage(text) : undefined;
  } catch {
    return undefined;
  }
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

/**
 * It uses window.fetch pathing. At this moment this is the easiest option to do it and should not affect anything.
 */
export function installSdkCallCapture(
  metabaseUrl: string | undefined,
): () => void {
  if (installed || typeof window === "undefined" || !metabaseUrl) {
    return () => undefined;
  }

  let metabaseOrigin: string;
  let basePath: string;
  try {
    const parsed = new URL(metabaseUrl);
    metabaseOrigin = parsed.origin;
    // A sub-path deployment prefixes every path; strip it.
    basePath = parsed.pathname.replace(/\/+$/, "");
  } catch {
    return () => undefined;
  }

  installed = true;

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveUrl(input);
    if (
      url?.origin !== metabaseOrigin ||
      (basePath && !url.pathname.startsWith(basePath))
    ) {
      return realFetch(input, init);
    }

    const method = resolveMethod(input, init);
    const endpoint = url.pathname.slice(basePath.length) || "/";
    const startedAt = performance.now();
    const durationMs = () => Math.round(performance.now() - startedAt);

    try {
      const response = await realFetch(input, init);
      recordDevDiagnostic({
        kind: "sdk-call",
        method,
        endpoint,
        status: response.status,
        durationMs: durationMs(),
        error: await captureFailureReason(response),
      });
      return response;
    } catch (error) {
      if (!isAbortError(error)) {
        recordDevDiagnostic({
          kind: "sdk-call",
          method,
          endpoint,
          status: null,
          durationMs: durationMs(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  };

  return () => {
    window.fetch = realFetch;
    installed = false;
  };
}
