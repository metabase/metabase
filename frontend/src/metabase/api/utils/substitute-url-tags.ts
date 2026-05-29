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
  method: string,
): string {
  return url.replace(URL_TAG_REGEX, (tag) => {
    const isRaw = tag.endsWith("*");
    const paramName = tag.slice(1, isRaw ? -1 : undefined);
    const value = data[paramName];
    delete data[paramName];
    if (value === undefined) {
      console.warn("Warning: calling", method, "without", tag);
      return "";
    }
    return isRaw ? String(value) : encodeURIComponent(String(value));
  });
}
