import { PLUGIN_METABOT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export function initializePlugin() {
  if (hasPremiumFeature("metabot_v3") && hasPremiumFeature("hosting")) {
    Object.assign(PLUGIN_METABOT, { isCloudManaged: true });
  }
}
