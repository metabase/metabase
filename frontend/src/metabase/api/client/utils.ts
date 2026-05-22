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
    // Streaming endpoints (queries, downloads) commit HTTP 202 up front, so a
    // post-commit failure can't change the status line — it's signalled by a
    // small {_status: N} JSON body. The only bodies possible on a 202 are JSON (a
    // result or that _status error) or a non-JSON export read off the clone by a
    // transformResponse caller. We only ever need JSON here: parse in one pass,
    // and treat a parse failure as a successful non-JSON export.
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  // Off the 202 path the backend only sets application/json when the body
  // is valid JSON. The one exception is an empty body (e.g. 204 No Content),
  // which we surface as null. A genuine parse failure here means the backend
  // broke that invariant, so let it throw rather than masking it as data.
  if (isJson(response)) {
    try {
      return await response.json();
    } catch (error) {
      return "";
    }
  }

  // Non-JSON bodies (text/plain 503 "still initializing", HTML errors) are read
  // as text so they can surface as error.data. An empty body is no content.
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isJson(response: Response): boolean {
  return (
    response.headers.get("Content-Type")?.includes("application/json") ?? false
  );
}

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
