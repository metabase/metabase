import { PLUGIN_WRITABLE_CONNECTION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WritableConnectionInfoSection } from "./components/WritableConnectionInfoSection";
import { getWritableConnectionInfoRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_WRITABLE_CONNECTION.getWritableConnectionInfoRoutes =
    getWritableConnectionInfoRoutes;

  if (hasPremiumFeature("writable_connection")) {
    PLUGIN_WRITABLE_CONNECTION.WritableConnectionInfoSection =
      WritableConnectionInfoSection;
  }
}
