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

function isOk(status: number): boolean {
  return 200 <= status && status <= 299;
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
 * A streamed 202 signals its real status in a `{_status: N}` body.
 */
function streamedStatus(body: unknown): number | undefined {
  if (
    body &&
    typeof body === "object" &&
    "_status" in body &&
    typeof body._status === "number" &&
    body._status > 0
  ) {
    return body._status;
  }
  return undefined;
}

/**
 * Read the body by its `Content-Type`: JSON natively (never materializing an
 * intermediate string), otherwise text. A successful JSON body must be
 * parseable, so a parse failure throws; on a failed response the body is error
 * data, so an empty or garbage body is swallowed to `null` rather than masking
 * the status with a `SyntaxError`.
 */
async function readResponseBody(
  response: Response,
  ok: boolean,
): Promise<unknown> {
  if (!isJson(response)) {
    return response.text();
  }
  return ok ? response.json() : parseJsonOrNull(response);
}

/**
 * Read and interpret a response into `{ ok, status, body }`, routed by status:
 *
 * - 202: a streamed query/download commits the 202 before its work can fail, so
 *   read the body to recover the real status from a `{_status}` payload. The
 *   read stays tolerant — a non-`_status` body (even a non-JSON export) is a
 *   success streamed straight through.
 *   TODO: a JSON error emitted mid-stream parses to a non-`_status` object and
 *   is silently treated as success.
 * - 204: no content.
 * - otherwise: the status line is authoritative; see `readResponseBody`.
 *
 * Does not throw on a non-2xx status — the caller inspects `ok`.
 */
async function readBody(response: Response): Promise<ResponseResult> {
  if (response.status === 202) {
    const body = await parseJsonOrNull(response);
    const status = streamedStatus(body) ?? 202;
    return { ok: isOk(status), status, body };
  }

  if (response.status === 204) {
    return { ok: true, status: 204, body: null };
  }

  const { status, ok } = response;
  const body = await readResponseBody(response, ok);
  return { ok, status, body };
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
