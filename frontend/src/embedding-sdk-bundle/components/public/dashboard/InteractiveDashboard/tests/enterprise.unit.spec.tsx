import { addEnterpriseSubscriptionsTests } from "../../shared-tests/subscriptions.spec";
import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../../tests/setup";
import { InteractiveDashboard } from "../InteractiveDashboard";

const setupEnterprise = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    enterprisePlugins: ["sdk_notifications"],
    component: InteractiveDashboard,
  });
};

console.warn = () => {};

describe("InteractiveDashboard", () => {
  addEnterpriseSubscriptionsTests(setupEnterprise);
});
