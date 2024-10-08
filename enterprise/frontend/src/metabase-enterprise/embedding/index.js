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
