import _ from "underscore";

import {
  SearchAwareLocation,
  SearchFilterKeys,
  SearchFilters,
} from "metabase/search/types";

export function isSearchPageLocation(location: SearchAwareLocation): boolean {
  const components = location.pathname.split("/");
  return components[components.length - 1] === "search";
}

export function getSearchTextFromLocation(
  location: SearchAwareLocation,
): string {
  if (isSearchPageLocation(location)) {
    return location.query.q || "";
  }
  return "";
}

export function getFiltersFromLocation(
  location: SearchAwareLocation,
): SearchFilters {
  if (isSearchPageLocation(location)) {
    return _.pick(location.query, Object.values(SearchFilterKeys));
  }
  return {};
}
