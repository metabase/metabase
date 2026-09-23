import { PLUGIN_SEMANTIC_SEARCH } from "metabase/plugins";
import { PLUGIN_SEARCH_FILTERS } from "metabase/search/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SearchSettingsWidget } from "./SearchSettingsWidget";
import { VibesFilter } from "./VibesFilter";

/**
 * Initialize semantic_search plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("semantic_search")) {
    PLUGIN_SEMANTIC_SEARCH.SearchSettingsWidget = SearchSettingsWidget;

    // Authenticated settings arrive after plugin initialization. The sidebar
    // checks vibes-enabled reactively when deciding whether to show this filter.
    Object.assign(PLUGIN_SEARCH_FILTERS, { VibesFilter });
  }
}
