import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ReplaceDataSourceModal } from "./components/ReplaceDataSourceModal";

export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_REPLACEMENT.isEnabled = true;
    PLUGIN_REPLACEMENT.ReplaceDataSourceModal = ReplaceDataSourceModal;
  }
}
