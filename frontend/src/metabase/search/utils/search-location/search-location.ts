import _ from "underscore";

import { SearchFilterKeys } from "metabase/search/constants";
import type {
  SearchAwareLocation,
  URLSearchFilterQueryParams,
} from "metabase/search/types";

export function isSearchPageLocation(location?: SearchAwareLocation): boolean {
  return location ? /^\/?search$/.test(location.pathname) : false;
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
): URLSearchFilterQueryParams {
  if (isSearchPageLocation(location)) {
    return _.pick(location.query, Object.values(SearchFilterKeys));
  }
  return {};
}
