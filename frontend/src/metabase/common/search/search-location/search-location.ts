import _ from "underscore";

import { SearchFilterKeys } from "metabase/common/search/constants";
import type { URLSearchFilterQueryParams } from "metabase/common/search/types";
import type { Location } from "metabase/router";
import { parseSearchQuery } from "metabase/utils/browser";

export function isSearchPageLocation(location?: Location): boolean {
  return location ? /^\/?search$/.test(location.pathname) : false;
}

export function getSearchTextFromLocation(location: Location): string {
  if (isSearchPageLocation(location)) {
    return new URLSearchParams(location.search).get("q") || "";
  }
  return "";
}

export function getFiltersFromLocation(
  location: Location,
): URLSearchFilterQueryParams {
  if (isSearchPageLocation(location)) {
    return _.pick(
      parseSearchQuery(location.search),
      Object.values(SearchFilterKeys),
    );
  }
  return {};
}
