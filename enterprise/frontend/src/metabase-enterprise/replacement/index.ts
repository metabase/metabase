import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ReplaceDataSourceModal } from "./components/ReplaceDataSourceModal";
import { SourceReplacementStatus } from "./components/SourceReplacementStatus";

export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_REPLACEMENT.isEnabled = true;
    PLUGIN_REPLACEMENT.canUserReplaceSources = getUserIsAdmin;
    PLUGIN_REPLACEMENT.ReplaceDataSourceModal = ReplaceDataSourceModal;
    PLUGIN_REPLACEMENT.SourceReplacementStatus = SourceReplacementStatus;
  }
}
