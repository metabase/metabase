import { addPremiumAutoRefreshTests } from "../../shared-tests/auto-refresh.spec";
import { addPremiumSubscriptionsTests } from "../../shared-tests/subscriptions.spec";
import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../../tests/setup";
import { InteractiveDashboard } from "../InteractiveDashboard";

const setupPremium = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    tokenFeatures: {
      embedding_sdk: true,
    },
    enterprisePlugins: ["sdk_notifications"],
    component: InteractiveDashboard,
  });
};

console.warn = () => {};

describe("InteractiveDashboard", () => {
  addPremiumSubscriptionsTests(setupPremium);
  addPremiumAutoRefreshTests(setupPremium);
});
