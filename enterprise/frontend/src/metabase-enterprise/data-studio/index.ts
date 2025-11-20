import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DataStudioToolbarButton } from "./query-builder/components/DataStudioToolbarButton";
import { getDataStudioRoutes } from "./routes";
import { canAccessDataStudio } from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("data_studio")) {
    PLUGIN_DATA_STUDIO.isEnabled = true;
    PLUGIN_DATA_STUDIO.canAccessDataStudio = canAccessDataStudio;
    PLUGIN_DATA_STUDIO.getDataStudioRoutes = getDataStudioRoutes;
    PLUGIN_DATA_STUDIO.DataStudioToolbarButton = DataStudioToolbarButton;
  }
}
