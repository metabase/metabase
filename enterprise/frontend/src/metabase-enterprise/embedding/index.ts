import {
  PLUGIN_ADMIN_SETTINGS,
  PLUGIN_EMBEDDING,
  lazyPluginComponent,
} from "metabase/plugins";
import { isInteractiveEmbeddingEnabled } from "metabase-enterprise/embedding/selectors";
import { hasPremiumFeature } from "metabase-enterprise/settings";

/**
 * We can't gate this component behind a feature flag, because SDK users could
 * use the SDK without a valid license and doesn't contain any feature flags.
 */
PLUGIN_EMBEDDING.SimpleDataPicker = lazyPluginComponent(() =>
  import("embedding/data-picker/SimpleDataPicker").then(
    ({ SimpleDataPicker }) => SimpleDataPicker,
  ),
);
PLUGIN_EMBEDDING.DataSourceSelector = lazyPluginComponent(() =>
  import("embedding/data-picker/DataSelector").then(
    ({ DataSourceSelector }) => DataSourceSelector,
  ),
);

/**
 * Initialize embedding plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("embedding")) {
    PLUGIN_EMBEDDING.isEnabled = () => true;
    PLUGIN_EMBEDDING.isInteractiveEmbeddingEnabled =
      isInteractiveEmbeddingEnabled;
    PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingSettingsCard =
      lazyPluginComponent(() =>
        import("./components/InteractiveEmbeddingSettingsCard").then(
          ({ InteractiveEmbeddingSettingsCard }) =>
            InteractiveEmbeddingSettingsCard,
        ),
      );
  }
}
