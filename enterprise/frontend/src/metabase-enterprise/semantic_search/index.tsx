import { PLUGIN_SEMANTIC_SEARCH } from "metabase/plugins";
import { PLUGIN_SEARCH_FILTERS } from "metabase/search/plugins";
import MetabaseSettings from "metabase/utils/settings";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SearchSettingsWidget } from "./SearchSettingsWidget";
import { VibesFilter } from "./VibesFilter";

/**
 * Initialize semantic_search plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("semantic_search")) {
    PLUGIN_SEMANTIC_SEARCH.SearchSettingsWidget = SearchSettingsWidget;

    // The "Order by vibes" search toggle only makes sense where the backend can honour it.
    if (MetabaseSettings.get("vibes-enabled")) {
      Object.assign(PLUGIN_SEARCH_FILTERS, { VibesFilter });
    }
  }
}
