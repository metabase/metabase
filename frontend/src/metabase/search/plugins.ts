import type { SearchFilterComponent } from "metabase/common/search/types";
import { definePluginSlot } from "metabase/plugins";

const getDefaultSearchFilters = () => ({
  // The OSS filter has no type, and SearchSidebar renders nothing for a filter without one.
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
});

export const PLUGIN_SEARCH_FILTERS = definePluginSlot(getDefaultSearchFilters);
