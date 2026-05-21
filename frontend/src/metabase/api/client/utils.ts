// Basename can be a path prefix ("/metabase") or a full URL with an optional
// subpath ("http://localhost/mb"). The status-code emit needs the path portion
// only — listeners expect "/api/..." regardless of how the host is wired.
export function getBasenamePath(basename: string): string {
  if (!basename) {
    return "";
  }
  try {
    return new URL(basename).pathname.replace(/\/$/, "");
  } catch {
    return basename.replace(/\/$/, "");
  }
}

export async function getResponseBody(response: Response): Promise<unknown> {
  const bodyText = await response.text();

  try {
    return JSON.parse(bodyText);
  } catch (error) {
    // do nothing
  }
  return bodyText;
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
