import { PLUGIN_LIBRARY } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getDataStudioLibraryRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("data_studio")) {
    PLUGIN_LIBRARY.isEnabled = true;
    PLUGIN_LIBRARY.getDataStudioLibraryRoutes = getDataStudioLibraryRoutes;
  }
}
