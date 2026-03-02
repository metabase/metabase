import { addEnterpriseAutoRefreshTests } from "../../shared-tests/auto-refresh.spec";
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
  addEnterpriseAutoRefreshTests(setupEnterprise);

  // eslint-disable-next-line jest/expect-expect -- Just want to ensure the type passes
  it('should accept "drillThroughQuestionProps.dataPicker"', async () => {
    <InteractiveDashboard
      dashboardId={1}
      drillThroughQuestionProps={{
        dataPicker: "staged",
      }}
    />;
  });
});
