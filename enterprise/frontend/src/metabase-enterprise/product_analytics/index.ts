import { PLUGIN_PRODUCT_ANALYTICS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ProductAnalyticsNavItem } from "./components/ProductAnalyticsNavItem";
import { getProductAnalyticsAdminRoutes } from "./routes";

export function initializePlugin() {
  // TODO: add proper feature token check
  if (hasPremiumFeature("hosting")) {
    PLUGIN_PRODUCT_ANALYTICS.isEnabled = true;
    PLUGIN_PRODUCT_ANALYTICS.getAdminRoutes = getProductAnalyticsAdminRoutes;
    PLUGIN_PRODUCT_ANALYTICS.ProductAnalyticsNavItem = ProductAnalyticsNavItem;
  }
}
