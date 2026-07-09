import type { Path, URLSearchParamsInit } from "./types";

/**
 * Split a path string into `pathname`, `search`, and `hash`, mirroring
 * react-router v7's `parsePath`. A part the string does not carry is left out
 * rather than set to `""`, which is how `resolveTo` tells `"?x=1"` (keep the
 * current pathname) apart from `"/"` (go to the root).
 */
export function parsePath(path: string): Partial<Path> {
  const parsed: Partial<Path> = {};

  if (!path) {
    return parsed;
  }

  const hashIndex = path.indexOf("#");
  if (hashIndex >= 0) {
    parsed.hash = path.slice(hashIndex);
    path = path.slice(0, hashIndex);
  }

  const searchIndex = path.indexOf("?");
  if (searchIndex >= 0) {
    parsed.search = path.slice(searchIndex);
    path = path.slice(0, searchIndex);
  }

  if (path) {
    parsed.pathname = path;
  }

  return parsed;
}

/**
 * Build a `URLSearchParams`, mirroring react-router v7's `createSearchParams`.
 */
export function createSearchParams(
  init: URLSearchParamsInit = "",
): URLSearchParams {
  if (
    typeof init === "string" ||
    Array.isArray(init) ||
    init instanceof URLSearchParams
  ) {
    return new URLSearchParams(init);
  }

  const params = new URLSearchParams();
  Object.entries(init).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
    } else {
      params.append(key, value);
    }
  });
  return params;
}

/**
 * Build the search params for a location, filling in any default key the
 * location does not already carry, mirroring react-router v7's
 * `getSearchParamsForLocation`.
 */
export function getSearchParamsForLocation(
  locationSearch: string,
  defaultSearchParams: URLSearchParams | null,
): URLSearchParams {
  const searchParams = createSearchParams(locationSearch);

  if (defaultSearchParams) {
    defaultSearchParams.forEach((_value, key) => {
      if (!searchParams.has(key)) {
        defaultSearchParams.getAll(key).forEach((value) => {
          searchParams.append(key, value);
        });
      }
    });
  }

  return searchParams;
}
