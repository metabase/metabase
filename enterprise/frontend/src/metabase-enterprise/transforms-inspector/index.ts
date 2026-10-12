import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";

import { getInspectorRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_TRANSFORMS_PYTHON.shouldShowInspectTab = true;
  PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes = getInspectorRoutes;
}
