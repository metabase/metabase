import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ReplaceDataSourceModal } from "./components/ReplaceDataSourceModal";

export function initializePlugin() {
  // TODO: enable the plugin when it's ready
  // eslint-disable-next-line no-constant-condition
  if (hasPremiumFeature("dependencies") && false) {
    PLUGIN_REPLACEMENT.isEnabled = true;
    PLUGIN_REPLACEMENT.canUserReplaceSource = getUserIsAdmin;
    PLUGIN_REPLACEMENT.ReplaceDataSourceModal = ReplaceDataSourceModal;
  }
}
