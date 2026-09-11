import { PLUGIN_SEMANTIC_SEARCH, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

/**
 * Initialize semantic_search plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("semantic_search")) {
    PLUGIN_SEMANTIC_SEARCH.SearchSettingsWidget = lazyPluginComponent(() =>
      import("./SearchSettingsWidget").then(
        ({ SearchSettingsWidget }) => SearchSettingsWidget,
      ),
    );
  }
}
