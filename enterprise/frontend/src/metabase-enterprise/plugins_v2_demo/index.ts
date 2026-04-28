import { hasPremiumFeature } from "metabase-enterprise/settings";

import { dashboardEePlugin } from "./dashboard-plugin";

export const initializePlugin = () => {
  if (hasPremiumFeature("whitelabel")) {
    dashboardEePlugin.activate();
  }
};
