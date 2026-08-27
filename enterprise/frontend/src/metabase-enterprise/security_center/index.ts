import { PLUGIN_SECURITY_CENTER } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SecurityCenterBanner } from "./components/SecurityCenterBanner/SecurityCenterBanner";
import { SecurityCenterMobileNavItem } from "./components/SecurityCenterNavItem/SecurityCenterMobileNavItem";
import { SecurityCenterNavItem } from "./components/SecurityCenterNavItem/SecurityCenterNavItem";
import { SecurityCenterPromoCard } from "./components/SecurityCenterPromoCard/SecurityCenterPromoCard";

const securityCenterPage = () =>
  import(
    /* webpackChunkName: "security-center" */ "./components/SecurityCenterPage/SecurityCenterPage"
  ).then(({ SecurityCenterPage }) => ({ Component: SecurityCenterPage }));

export function initializePlugin() {
  if (hasPremiumFeature("admin_security_center")) {
    PLUGIN_SECURITY_CENTER.isEnabled = true;
    PLUGIN_SECURITY_CENTER.securityCenterPage = securityCenterPage;
    PLUGIN_SECURITY_CENTER.SecurityCenterBanner = SecurityCenterBanner;
    PLUGIN_SECURITY_CENTER.SecurityCenterPromoCard = SecurityCenterPromoCard;
    PLUGIN_SECURITY_CENTER.SecurityCenterNavItem = SecurityCenterNavItem;
    PLUGIN_SECURITY_CENTER.SecurityCenterMobileNavItem =
      SecurityCenterMobileNavItem;
  }
}
