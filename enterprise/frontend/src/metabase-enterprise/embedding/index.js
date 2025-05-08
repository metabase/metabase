import { DataSourceSelector } from "embedding/data-picker/DataSelector";
import { SimpleDataPicker } from "embedding/data-picker/SimpleDataPicker";
import { PLUGIN_ADMIN_SETTINGS, PLUGIN_EMBEDDING } from "metabase/plugins";
import { isInteractiveEmbeddingEnabled } from "metabase-enterprise/embedding/selectors";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { InteractiveEmbeddingSettings } from "./components/InteractiveEmbeddingSettings";

if (hasPremiumFeature("embedding")) {
  PLUGIN_EMBEDDING.isEnabled = () => true;
  PLUGIN_EMBEDDING.isInteractiveEmbeddingEnabled =
    isInteractiveEmbeddingEnabled;

  PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingSettings =
    InteractiveEmbeddingSettings;
}

/**
 * We can't gate this component behind a feature flag, because SDK users could
 * use the SDK without a valid license and doesn't contain any feature flags.
 */
PLUGIN_EMBEDDING.SimpleDataPicker = SimpleDataPicker;
PLUGIN_EMBEDDING.DataSourceSelector = DataSourceSelector;
