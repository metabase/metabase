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

export function getEncodedUrlSearchParams(query: Record<string, unknown>) {
  return new URLSearchParams(
    extractQueryParams(query).map(([key, value]) => {
      if (value == null) {
        return [key, ""];
      }
      return [key, value];
    }),
  );
}
