import { DataSourceSelector } from "embedding/data-picker/DataSelector";
import { SimpleDataPicker } from "embedding/data-picker/SimpleDataPicker";
import { PLUGIN_EMBEDDING } from "metabase/plugins";

import { hasEmbeddingFeature } from "./has-embedding-feature";
import { isInteractiveEmbeddingEnabled } from "./selectors";

export function initializePlugin() {
  // The SDK can run without a valid license, which is what carries the feature flags,
  // so the data pickers are registered regardless of the embedding feature.
  PLUGIN_EMBEDDING.SimpleDataPicker = SimpleDataPicker;
  PLUGIN_EMBEDDING.DataSourceSelector = DataSourceSelector;

  if (hasEmbeddingFeature()) {
    PLUGIN_EMBEDDING.isEnabled = () => true;
    PLUGIN_EMBEDDING.isInteractiveEmbeddingEnabled =
      isInteractiveEmbeddingEnabled;
  }
}
