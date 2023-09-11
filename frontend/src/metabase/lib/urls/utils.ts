import MetabaseSettings from "metabase/lib/settings";

export function appendSlug(path: string | number, slug?: string) {
  return slug ? `${path}-${slug}` : String(path);
}

export function extractEntityId(slug = "") {
  const id = parseInt(slug, 10);
  return Number.isSafeInteger(id) ? id : undefined;
}

function flattenParam([key, value]: [string, unknown]) {
  if (value instanceof Array) {
    return value.map(p => [key, p]);
  }
  return [[key, value]];
}

export function extractQueryParams(query: Record<string, unknown>) {
  return Object.entries(query).map(flattenParam).flat();
}

export function getURLIncludingSubpath(path: string) {
  const siteURL = trimLastSlash(MetabaseSettings.get("site-url") ?? "");

  if (isSubpath(siteURL)) {
    return `${siteURL}${path}`;
  }

  return path;
}

export function isSubpath(url: string) {
  return new URL(url).origin !== trimLastSlash(url);
}

export function trimLastSlash(url: string) {
  return url.replace(/\/+$/, "");
}
