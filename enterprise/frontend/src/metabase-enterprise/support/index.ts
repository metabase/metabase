import { PLUGIN_SUPPORT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SupportSettingsSection } from "./components/SupportSettingsSection";

export function initializePlugin() {
  if (hasPremiumFeature("support-users")) {
    PLUGIN_SUPPORT.isEnabled = true;
    PLUGIN_SUPPORT.SupportSettings = SupportSettingsSection;
  }
}
