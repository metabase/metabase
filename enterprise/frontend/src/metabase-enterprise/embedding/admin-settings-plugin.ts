import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { InteractiveEmbeddingSettingsCard } from "./components/InteractiveEmbeddingSettingsCard";
import { hasEmbeddingFeature } from "./has-embedding-feature";

export function initializePlugin() {
  if (hasEmbeddingFeature()) {
    PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingSettingsCard =
      InteractiveEmbeddingSettingsCard;
  }
}
