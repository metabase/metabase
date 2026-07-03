import type { Path, URLSearchParamsInit } from "./types";

/**
 * Split a path string into `pathname`, `search`, and `hash`, mirroring
 * react-router v7's `parsePath`. Used when a string destination has to be
 * combined with history `state` into a v3 location descriptor.
 */
export function parsePath(path: string): Path {
  let pathname = path;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex);
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex);
  }

  return { pathname, search, hash };
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
