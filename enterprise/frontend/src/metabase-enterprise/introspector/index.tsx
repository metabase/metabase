import { PLUGIN_INTROSPECTOR } from "metabase/plugins";

import { IntrospectorPage } from "./IntrospectorPage";
import { initializeWorkloadPlugin } from "./workload";

/**
 * POC: enable unconditionally for EE builds. No premium-feature gate.
 */
export function initializePlugin() {
  PLUGIN_INTROSPECTOR.isEnabled = true;
  PLUGIN_INTROSPECTOR.IntrospectorPage = IntrospectorPage;
  initializeWorkloadPlugin();
}
