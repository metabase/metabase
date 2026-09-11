import { PLUGIN_MONITOR_TOOLS, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

/**
 * Initialize tools plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("audit_app")) {
    PLUGIN_MONITOR_TOOLS.COMPONENT = lazyPluginComponent(() =>
      import("./ErrorOverview").then(({ ErrorOverview }) => ErrorOverview),
    );
  }
}
