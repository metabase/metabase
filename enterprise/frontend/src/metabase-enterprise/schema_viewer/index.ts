import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_SCHEMA_VIEWER } from "metabase/plugins";

import { getDataStudioSchemaViewerRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("schema-viewer")) {
    PLUGIN_SCHEMA_VIEWER.isEnabled = true;
    PLUGIN_SCHEMA_VIEWER.getDataStudioSchemaViewerRoutes =
      getDataStudioSchemaViewerRoutes;
  }
}
