import { PLUGIN_INTROSPECTOR } from "metabase/plugins";

import { WorkloadPage } from "./WorkloadPage";

export function initializeWorkloadPlugin() {
  PLUGIN_INTROSPECTOR.WorkloadPage = WorkloadPage;
}
