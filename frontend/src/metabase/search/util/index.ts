import { Location } from "history";
import { FilterType } from "metabase/nav/components/Search/SearchFilterModal/types";
import { SearchModelType } from "metabase-types/api";

export type SearchFilterType = {
  [FilterType.Type]?: SearchModelType[] | undefined;
} & {
  [key in FilterType]?: string | string[];
};

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
    return location.query.q || "";
  }
}
