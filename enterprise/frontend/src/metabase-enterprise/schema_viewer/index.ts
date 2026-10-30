import { PLUGIN_SCHEMA_VIEWER } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  getDataStudioSchemaViewerRoutes,
  registerSchemaViewerPagePrefetch,
} from "./routes";

export function initializePlugin() {
  PLUGIN_SCHEMA_VIEWER.getDataStudioSchemaViewerRoutes =
    getDataStudioSchemaViewerRoutes;

  if (hasPremiumFeature("schema-viewer")) {
    PLUGIN_SCHEMA_VIEWER.isEnabled = true;
    registerSchemaViewerPagePrefetch();
  }
}
