import { StreamInterruptedError } from "./errors";

type ResponseResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

// Basename can be a path prefix ("/metabase") or a full URL with an optional
// subpath ("http://localhost/mb"). The status-code emit needs the path portion
// only, listeners expect "/api/..." regardless of how the host is wired.
export function getBasenamePath(basename: string): string {
  if (!basename) {
    return "";
  }
  try {
    const url = new URL(basename);
    return trimSuffix(url.pathname, "/");
  } catch {
    // not a full url, assume it's a path prefix
    return trimSuffix(basename, "/");
  }
}

export function relativeUrl(basename: string, url: URL): string {
  const basenamePath = getBasenamePath(basename);
  const relativePath = removePrefix(url.pathname, basenamePath);
  return relativePath + url.search;
}

function removePrefix(str: string, prefix: string): string {
  return str.startsWith(prefix) ? str.slice(prefix.length) : str;
}

function trimSuffix(str: string, suffix: string): string {
  return str.endsWith(suffix) ? str.slice(0, -suffix.length) : str;
}

export function appendQueryParameters(
  url: URL,
  params: Record<string, unknown>,
) {
  for (const key in params) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.append(key, String(value));
    }
  }
}

function isJson(response: Response): boolean {
  return (
    response.headers.get("Content-Type")?.includes("application/json") ?? false
  );
}

/**
 * Parse a JSON body stream natively — `response.json()` never materializes the
 * payload as a JS string the way `text()` + `JSON.parse` would. A body that
 * can't be parsed (empty, truncated, or mislabeled `application/json`) resolves
 * to `null` rather than throwing, so it can never mask the response's status
 * with an opaque, status-less `SyntaxError`.
 */
async function parseJsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Read a response body by its `Content-Type`: JSON natively (never materializing
 * an intermediate string), otherwise text. A successful JSON body must be
 * parseable, so a parse failure throws; a failed response's body is error data,
 * so an empty or garbage body is swallowed to `null` rather than masking the
 * status with a `SyntaxError`.
 *
 * The response is already committed by the time we read it, so a read that
 * rejects with a `TypeError` is the body stream breaking mid-flight — a streamed
 * query/export that errored after committing aborts the connection without a
 * clean terminator. Surface that as a typed `StreamInterruptedError` so the UI
 * can distinguish it from a genuine connectivity failure (where no response
 * arrives at all) instead of showing a misleading "server issues" message. A
 * `SyntaxError` from a complete-but-malformed body is a real parse problem and
 * propagates unchanged.
 */
async function readBody(response: Response): Promise<unknown> {
  try {
    if (!isJson(response)) {
      return await response.text();
    }
    return response.ok
      ? await response.json()
      : await parseJsonOrNull(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new StreamInterruptedError(error.message);
    }
    throw error;
  }
}

/**
 * Interpret a fetched `Response` into a `{ ok, status, body }` result. It does
 * not throw on a non-ok status — the caller decides what to do with it — but a
 * body that fails to read (e.g. a streamed response aborted mid-flight) still
 * rejects, which is how a mid-stream failure surfaces.
 *
 * The body is only read when it'll actually be used — as the result of a normal
 * request, or as error data. A `rawResponse` caller whose request succeeded gets
 * the `Response` itself as `body`, unread, so a binary payload like a map tile or
 * a streamed export is never decoded as text.
 */
export async function handleResponse(
  response: Response,
  rawResponse?: boolean,
): Promise<ResponseResult> {
  // The status is authoritative, so skip reading the body and return the untouched
  // Response — this keeps a binary payload like a map tile or a streamed export
  // from being decoded as text. A streamed export that fails mid-flight aborts the
  // connection, so a body that reads to completion is a genuine success; there is
  // no error blob to recover from the body here. A failed rawResponse request
  // falls through so its body can be read as error data.
  if (rawResponse && response.ok) {
    return { ok: true, status: response.status, body: response };
  }

  if (response.status === 204) {
    // Empty response: body is null
    return { ok: true, status: 204, body: null };
  }

  const { ok, status } = response;
  return { ok, status, body: await readBody(response) };
}

// `:tag` placeholders are URL-encoded (slashes become %2F).
const URL_TAG_REGEX = /:\w+/g;

/**
 * Replace `:tag` placeholders in a URL template with values pulled from `data`
 * (params) first, then falling back to `body` fields — this is how an embed
 * `:token` gets filled from the request body. The key is consumed from
 * whichever bag held it, so the caller can use any leftovers as querystring
 * params (from `data`) or as the JSON body (from `body`).
 */
export function substituteUrlTags(
  url: string,
  data: Record<string, unknown>,
  body?: Record<string, unknown>,
): string {
  return url.replace(URL_TAG_REGEX, (tag) => {
    const paramName = tag.slice(1);
    let value: unknown;
    for (const bag of [data, body]) {
      if (bag && paramName in bag) {
        value = bag[paramName];
        delete bag[paramName];
        // A key present in `data` but explicitly `undefined` still falls
        // through to `body` (e.g. an absent param, real token in the body).
        if (value !== undefined) {
          break;
        }
      }
    }
    if (value === undefined) {
      console.warn("Warning: calling", url, "without", tag);
      return "";
    }
    return encodeURIComponent(String(value));
  });
}
