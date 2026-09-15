import type { SearchFilterComponent } from "metabase/common/search/types";
import { definePluginSlot } from "metabase/plugins";

const getDefaultSearchFilters = () => ({
  // Leaving type unset hides the filter.
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
});

export const PLUGIN_SEARCH_FILTERS = definePluginSlot(getDefaultSearchFilters);
