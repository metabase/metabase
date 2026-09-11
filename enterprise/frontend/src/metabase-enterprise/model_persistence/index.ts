import {
  PLUGIN_MODEL_PERSISTENCE,
  lazyPluginComponent,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

/**
 * Initialize model persistence plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("cache_granular_controls")) {
    PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled = () => true;
    PLUGIN_MODEL_PERSISTENCE.ModelCacheToggle = lazyPluginComponent(() =>
      import("./components/ModelCacheControl").then(
        ({ ModelCacheToggle }) => ModelCacheToggle,
      ),
    );
  }
}
