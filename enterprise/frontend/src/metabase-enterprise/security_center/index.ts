import { PLUGIN_SECURITY_CENTER } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SecurityCenterBanner } from "./components/SecurityCenterBanner/SecurityCenterBanner";
import { SecurityCenterMobileNavItem } from "./components/SecurityCenterNavItem/SecurityCenterMobileNavItem";
import { SecurityCenterNavItem } from "./components/SecurityCenterNavItem/SecurityCenterNavItem";
import { SecurityCenterPage } from "./components/SecurityCenterPage/SecurityCenterPage";

if (hasPremiumFeature("admin_security_center")) {
  PLUGIN_SECURITY_CENTER.isEnabled = true;
  PLUGIN_SECURITY_CENTER.SecurityCenterPage = SecurityCenterPage;
  PLUGIN_SECURITY_CENTER.SecurityCenterBanner = SecurityCenterBanner;
  PLUGIN_SECURITY_CENTER.SecurityCenterNavItem = SecurityCenterNavItem;
  PLUGIN_SECURITY_CENTER.SecurityCenterMobileNavItem =
    SecurityCenterMobileNavItem;
}
