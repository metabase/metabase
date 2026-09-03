import type { SearchFilterComponent } from "metabase/common/search/types";

export const PLUGIN_SEARCH_FILTERS = {
  // The OSS filter has no type, and SearchSidebar renders nothing for a filter without one.
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
};
