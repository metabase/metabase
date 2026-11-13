import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  type SetupOpts,
  USAGE_ANALYTICS_DASHBOARD_TEST_ID,
  setup as baseSetup,
} from "./setup";

const setup = (props: Omit<SetupOpts, "enableAuditAppPlugin">) =>
  baseSetup({ enableAuditAppPlugin: true, ...props });

describe("InsightsAction (EE with token)", () => {
  describe("for admins", () => {
    it("links to the dashboard's usage analytics", async () => {
      const { router } = await setup({
        isForADashboard: true,
        isUserAdmin: true,
      });

      expect(screen.queryByTestId("upsell-gem")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("link", { name: "Insights" }));

      expect(router?.location.pathname).toBe("/dashboard/201");
      expect(router?.location.search).toBe("?dashboard_id=1");
      expect(
        await screen.findByTestId(USAGE_ANALYTICS_DASHBOARD_TEST_ID),
      ).toBeInTheDocument();
    });

    it("links to the question's usage analytics", async () => {
      const { router } = await setup({
        isForADashboard: false,
        isUserAdmin: true,
      });

      await userEvent.click(screen.getByRole("link", { name: "Insights" }));

      expect(router?.location.pathname).toBe("/dashboard/202");
      expect(router?.location.search).toBe("?question_id=0");
      expect(
        await screen.findByTestId(USAGE_ANALYTICS_DASHBOARD_TEST_ID),
      ).toBeInTheDocument();
    });

    it("renders nothing for instance analytics content", async () => {
      await setup({
        isForADashboard: true,
        isUserAdmin: true,
        collection: createMockCollection({ type: "instance-analytics" }),
      });

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("for non-admins", () => {
    it("links to usage analytics when they can view it", async () => {
      const { router } = await setup({
        isForADashboard: true,
        isUserAdmin: false,
        hasUsageAnalyticsPermission: true,
      });

      await userEvent.click(screen.getByRole("link", { name: "Insights" }));

      expect(router?.location.pathname).toBe("/dashboard/201");
      expect(router?.location.search).toBe("?dashboard_id=1");
    });

    it("renders nothing when they cannot view it", async () => {
      await setup({
        isForADashboard: true,
        isUserAdmin: false,
        hasUsageAnalyticsPermission: false,
      });

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
