import { PLUGIN_SECURITY_CENTER } from "metabase/plugins";
// import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SecurityCenterPage } from "./components/SecurityCenterPage/SecurityCenterPage";

export function initializePlugin() {
  // if (hasPremiumFeature("security_advisories")) {
  PLUGIN_SECURITY_CENTER.isEnabled = true;
  PLUGIN_SECURITY_CENTER.SecurityCenterPage = SecurityCenterPage;
  // }
}
