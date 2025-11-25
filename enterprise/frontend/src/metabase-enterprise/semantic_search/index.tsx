import { PLUGIN_SEMANTIC_SEARCH } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SearchSettingsWidget } from "./SearchSettingsWidget";

/**
 * Initialize semantic_search plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("semantic_search")) {
    PLUGIN_SEMANTIC_SEARCH.SearchSettingsWidget = SearchSettingsWidget;
  }
}
