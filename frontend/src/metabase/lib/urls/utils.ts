import { PLUGIN_URL_UPDATES } from "metabase/plugins";

export const getUrl = (url: string): string => {
  return PLUGIN_URL_UPDATES.reduce((url, callback) => callback(url), url);
};

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
  return Object.entries(query)
    .map(flattenParam)
    .flat();
}
