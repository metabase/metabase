import type { URLSearchParamsInit } from "./types";

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
