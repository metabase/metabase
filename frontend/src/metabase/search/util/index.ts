import { Location } from "history";
import { FilterType } from "metabase/nav/components/Search/SearchFilterModal/types";

export type SearchFilterType = Partial<{
  [key in FilterType]: unknown;
}>;

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
