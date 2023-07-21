import { Location } from "history";
import _ from "underscore";
import {
  SearchFilterKeys,
  SearchFilterType,
} from "metabase/nav/components/Search/SearchFilterModal/types";

export type SearchAwareLocation = Location<{ q?: string } & SearchFilterType>;

export function isSearchPageLocation(location: SearchAwareLocation) {
  const components = location.pathname.split("/");
  return components[components.length - 1];
}

export function getSearchTextFromLocation(location: SearchAwareLocation) {
  if (isSearchPageLocation(location)) {
    return location.query.q || "";
  }
  return "";
}

export function getFiltersFromLocation(location: SearchAwareLocation) {
  if (isSearchPageLocation(location)) {
    return _.pick(location.query, Object.values(SearchFilterKeys));
  }
  return {};
}
