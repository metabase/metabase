import { PLUGIN_PRODUCT_ANALYTICS } from "metabase/plugins";

import { ProductAnalyticsNavItem } from "./components/ProductAnalyticsNavItem";
import { getProductAnalyticsAdminRoutes } from "./routes";

export function initializePlugin() {
  // TODO: add proper feature token check
  PLUGIN_PRODUCT_ANALYTICS.isEnabled = true;
  PLUGIN_PRODUCT_ANALYTICS.getAdminRoutes = getProductAnalyticsAdminRoutes;
  PLUGIN_PRODUCT_ANALYTICS.ProductAnalyticsNavItem = ProductAnalyticsNavItem;
}
