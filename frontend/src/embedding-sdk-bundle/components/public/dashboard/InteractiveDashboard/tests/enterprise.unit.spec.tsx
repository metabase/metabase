import { screen } from "__support__/ui";

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

  describe("PDF downloads", () => {
    it("should show the PDF download button when with-downloads is true", async () => {
      await setupEnterprise({ props: { withDownloads: true } });
      await screen.findByTestId("dashboard-header");

      expect(screen.getByLabelText("Download as PDF")).toBeVisible();
    });

    it("should hide PDF download button when with-downloads is false", async () => {
      await setupEnterprise({ props: { withDownloads: false } });
      await screen.findByTestId("dashboard-header");

      expect(
        screen.queryByLabelText("Download as PDF"),
      ).not.toBeInTheDocument();
    });
  });

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
