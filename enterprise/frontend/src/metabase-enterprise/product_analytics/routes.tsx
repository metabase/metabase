import { Route } from "react-router";

import { ProductAnalyticsSettingsPage } from "./ProductAnalyticsSettingsPage";

export const getProductAnalyticsAdminRoutes = () => {
  return (
    <Route path="product-analytics" component={ProductAnalyticsSettingsPage} />
  );
};
