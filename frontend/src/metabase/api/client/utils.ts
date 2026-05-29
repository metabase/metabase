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

export async function getResponseBody(response: Response): Promise<unknown> {
  if (response.status === 202) {
    // HTTP 202 - Accepted
    // Streaming endpoints (queries, downloads) commit HTTP 202 up front, so a
    // post-commit failure can't change the status line — it's signalled by a
    // small {_status: N} JSON body. The only bodies possible on a 202 are JSON (a
    // result or that _status error) or a non-JSON export read off the clone by a
    // transformResponse caller. We only ever need JSON here: parse in one pass,
    // and treat a parse failure as a successful non-JSON export.
    //
    // TODO: This is a bug. The server can return a json error at any time in the response, and that would silently fail here.
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  if (response.status === 204) {
    // HTTP 204 - No Content
    return null;
  }

  if (isJson(response)) {
    return response.json();
  }

  return response.text();
}

function isJson(response: Response): boolean {
  return (
    response.headers.get("Content-Type")?.includes("application/json") ?? false
  );
}

/**
 * Resolve a response's real status. A streaming endpoint commits a 202 before
 * its work can fail, then signals the true status in a `{_status: N}` body; this
 * recovers it, falling back to the HTTP status for every other response.
 */
export function getResponseStatus(response: Response, body: unknown): number {
  if (
    response.status === 202 &&
    body &&
    typeof body === "object" &&
    "_status" in body &&
    typeof body._status === "number" &&
    body._status > 0
  ) {
    return body._status;
  }

  return response.status;
}

/**
 * Interpret a fetched `Response` into a `{ ok, status, body }` result, without
 * emitting or throwing — the caller decides what to do with a non-ok status.
 *
 * The body is only read when it'll actually be used — as the result of a normal
 * request, as error data, or to recover the real status of a 202 streaming
 * response (whose status hides in a `{_status}` body). A `rawResponse` caller
 * whose non-202 request succeeded gets the `Response` itself as `body`, unread,
 * so a binary payload like a map tile is never decoded as text.
 */
export async function handleResponse(
  response: Response,
  rawResponse?: boolean,
): Promise<ResponseResult> {
  // Hand back the raw Response only when the caller asked for it and the request
  // succeeded. A failure falls through below so its body can be read as error
  // data; a 202 counts as ok here and is sorted out next.
  if (rawResponse && response.ok) {
    if (response.status === 202) {
      // A 202's HTTP status can't be trusted (a streamed export commits it
      // before the work can fail), so read the body to learn the real status.
      // The caller still needs an unread Response, so clone before reading.
      const unreadResponse = response.clone();
      const info = await readBody(response);
      if (!info.ok) {
        return info;
      }
      return { ...info, body: unreadResponse };
    }

    // A non-202 status is authoritative, so skip reading the body entirely and
    // return the untouched Response — this is what keeps a binary payload like a
    // map tile from being decoded as text.
    return { ok: true, status: response.status, body: response };
  }

  // Either the caller doesn't want the raw Response (the parsed body IS the
  // result) or the request failed (the body is the error payload). Read it and
  // let the caller inspect `ok`.
  return await readBody(response);
}

/**
 * Read and parse the response body, returning it with the resolved status and
 * whether that status is 2xx. Does not throw on a non-2xx status — the caller
 * inspects `ok`.
 */
async function readBody(response: Response): Promise<ResponseResult> {
  const body = await getResponseBody(response);
  const status = getResponseStatus(response, body);
  const ok = 200 <= status && status <= 299;
  return { ok, status, body };
}

// URL template tags:
// - `:tag`  — value is URL-encoded (default; slashes become %2F).
// - `:tag*` — value is substituted raw (slashes preserved), for endpoints
//             whose route includes a multi-segment path parameter.
const URL_TAG_REGEX = /:\w+\*?/g;

/**
 * Replace `:tag` / `:tag*` placeholders in a URL template with values pulled
 * from `data`. Substituted keys are deleted from `data` so the caller can use
 * any leftovers as querystring params.
 */
export function substituteUrlTags(
  url: string,
  data: Record<string, unknown>,
): string {
  return url.replace(URL_TAG_REGEX, (tag) => {
    const isRaw = tag.endsWith("*");
    const paramName = tag.slice(1, isRaw ? -1 : undefined);
    const value = data[paramName];
    delete data[paramName];
    if (value === undefined) {
      console.warn("Warning: calling", url, "without", tag);
      return "";
    }
    return isRaw ? String(value) : encodeURIComponent(String(value));
  });
}
