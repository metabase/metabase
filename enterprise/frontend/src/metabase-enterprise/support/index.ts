import { isEEBuild } from "metabase/lib/utils";
import { PLUGIN_SUPPORT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  GrantAccessModal,
  SupportSettingsSection,
} from "./components/SupportSettingsSection";

export function initializePlugin() {
  if (hasPremiumFeature("support-users") && isEEBuild()) {
    PLUGIN_SUPPORT.isEnabled = true;
    PLUGIN_SUPPORT.SupportSettings = SupportSettingsSection;
    PLUGIN_SUPPORT.GrantAccessModal = GrantAccessModal;
  }
}
