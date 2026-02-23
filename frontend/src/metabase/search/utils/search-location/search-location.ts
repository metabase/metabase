import _ from "underscore";

import { SearchFilterKeys } from "metabase/search/constants";
import type {
  SearchAwareLocation,
  URLSearchFilterQueryParams,
} from "metabase/search/types";

function getQueryFromLocation(location: SearchAwareLocation) {
  const query: Record<string, string | string[]> = {};
  const search = location.search ?? "";
  const searchParams = new URLSearchParams(search);
  searchParams.forEach((value, key) => {
    const existing = query[key];
    if (existing == null) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      query[key] = [...existing, value];
    } else {
      query[key] = [existing, value];
    }
  });

  return query;
}

export function isSearchPageLocation(location?: SearchAwareLocation): boolean {
  return location ? /^\/?search$/.test(location.pathname) : false;
}

export function getSearchTextFromLocation(
  location: SearchAwareLocation,
): string {
  if (isSearchPageLocation(location)) {
    return (getQueryFromLocation(location).q as string) || "";
  }
  return "";
}

export function getFiltersFromLocation(
  location: SearchAwareLocation,
): URLSearchFilterQueryParams {
  if (isSearchPageLocation(location)) {
    return _.pick(
      getQueryFromLocation(location),
      Object.values(SearchFilterKeys),
    );
  }
  return {};
}
