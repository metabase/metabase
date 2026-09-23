import type { SearchFilterComponent } from "metabase/common/search/types";
import { definePluginSlot } from "metabase/plugins";

const getDefaultSearchFilters = () => ({
  // Leaving type unset hides the filter.
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
  // Same: the semantic_search plugin fills it in when the instance has vibes enabled.
  VibesFilter: {} as SearchFilterComponent<"vibes">,
});

export const PLUGIN_SEARCH_FILTERS = definePluginSlot(getDefaultSearchFilters);
