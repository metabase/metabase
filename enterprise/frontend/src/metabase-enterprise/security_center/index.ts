import { PLUGIN_SECURITY_CENTER, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

const securityCenterPage = () =>
  import(
    /* webpackChunkName: "security-center" */ "./components/SecurityCenterPage/SecurityCenterPage"
  ).then(({ SecurityCenterPage }) => ({ Component: SecurityCenterPage }));

export function initializePlugin() {
  if (hasPremiumFeature("admin_security_center")) {
    PLUGIN_SECURITY_CENTER.isEnabled = true;
    PLUGIN_SECURITY_CENTER.securityCenterPage = securityCenterPage;
    PLUGIN_SECURITY_CENTER.SecurityCenterBanner = lazyPluginComponent(() =>
      import("./components/SecurityCenterBanner/SecurityCenterBanner").then(
        ({ SecurityCenterBanner }) => SecurityCenterBanner,
      ),
    );
    PLUGIN_SECURITY_CENTER.SecurityCenterPromoCard = lazyPluginComponent(() =>
      import("./components/SecurityCenterPromoCard/SecurityCenterPromoCard").then(
        ({ SecurityCenterPromoCard }) => SecurityCenterPromoCard,
      ),
    );
    PLUGIN_SECURITY_CENTER.SecurityCenterNavItem = lazyPluginComponent(() =>
      import("./components/SecurityCenterNavItem/SecurityCenterNavItem").then(
        ({ SecurityCenterNavItem }) => SecurityCenterNavItem,
      ),
    );
    PLUGIN_SECURITY_CENTER.SecurityCenterMobileNavItem = lazyPluginComponent(
      () =>
        import("./components/SecurityCenterNavItem/SecurityCenterMobileNavItem").then(
          ({ SecurityCenterMobileNavItem }) => SecurityCenterMobileNavItem,
        ),
    );
  }
}
