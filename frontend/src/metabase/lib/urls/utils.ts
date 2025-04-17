import api from "metabase/lib/api";

export function appendSlug(path: string | number, slug?: string) {
  return slug ? `${path}-${slug}` : String(path);
}

export function extractEntityId(slug = "") {
  const id = parseInt(slug, 10);
  return Number.isSafeInteger(id) ? id : undefined;
}

function flattenParam([key, value]: [string, unknown]) {
  if (value instanceof Array) {
    return value.map((p) => [key, p]);
  }
  return [[key, value]];
}

export function extractQueryParams(query: Record<string, unknown>) {
  return Object.entries(query).map(flattenParam).flat();
}

export function getEncodedUrlSearchParams(query: Record<string, unknown>) {
  return extractQueryParams(query)
    .map(([key, value]) => {
      if (value == null) {
        return `${key}=`;
      }
      return `${key}=${encodeURIComponent(value)}`;
    })
    .join("&");
}

export function getSubpathSafeUrl(url: string) {
  const basename = api.basename;
  const normalizedUrl =
    !basename || !url || url.startsWith("/") ? url : `/${url}`;

  return `${api.basename}${normalizedUrl}`;
}

/**
 * Metabase can be deployed on a subpath!
 * If you're opening internal links in a new tab, make sure you're using subpath-safe URLs.
 * @see {@link getSubpathSafeUrl}
 */
export const openInNewTab = (url: string) => {
  window.open(url, "_blank");
};
