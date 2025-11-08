import { PLUGIN_PREMIUM_SUPPORT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SupportSettingsPage } from "./SupportSettingsPage";

if (hasPremiumFeature("support-users")) {
  PLUGIN_PREMIUM_SUPPORT.SupportSettings = SupportSettingsPage;
}
