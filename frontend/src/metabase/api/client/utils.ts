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

export function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}

export function isRetriableError(error: unknown): boolean {
  return getErrorStatus(error) === 503;
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
