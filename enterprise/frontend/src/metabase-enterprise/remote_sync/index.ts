import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getIsRemoteSyncReadOnly } from "./selectors";

export function initializePlugin() {
  if (hasPremiumFeature("remote_sync")) {
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly = getIsRemoteSyncReadOnly;
  }
}
