import { PLUGIN_INTROSPECTOR } from "metabase/plugins";

import { IntrospectorNavItem } from "./IntrospectorNavItem";
import { IntrospectorPage } from "./IntrospectorPage";
import { initializeWorkloadPlugin } from "./workload";

/**
 * POC: enable unconditionally for EE builds. No premium-feature gate.
 */
export function initializePlugin() {
  PLUGIN_INTROSPECTOR.isEnabled = true;
  PLUGIN_INTROSPECTOR.IntrospectorPage = IntrospectorPage;
  PLUGIN_INTROSPECTOR.IntrospectorNavItem = IntrospectorNavItem;
  initializeWorkloadPlugin();
}
