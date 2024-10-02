import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setup } from "./setup";

describe("InsightsTabOrLink (EE)", () => {
  describe("for admins", () => {
    it("renders a link for a dashboard", async () => {
      const { history } = setup({
        enableAuditAppPlugin: true,
        isForADashboard: true,
        isUserAdmin: true,
      });
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      const routerLink = await screen.findByText("Insights");
      await userEvent.click(routerLink);
      expect(history?.getCurrentLocation().pathname).toBe("/dashboard/201");
      expect(history?.getCurrentLocation().query).toEqual({
        dashboard_id: "1",
      });
      expect(
        await screen.findByTestId("usage-analytics-dashboard"),
      ).toBeInTheDocument();
    });

    it("can render a link for a question", async () => {
      const { history } = setup({
        enableAuditAppPlugin: true,
        isForADashboard: false,
        isUserAdmin: true,
      });
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      const routerLink = await screen.findByText("Insights");
      await userEvent.click(routerLink);
      expect(history?.getCurrentLocation().pathname).toBe("/dashboard/202");
      expect(history?.getCurrentLocation().query).toEqual({ question_id: "0" });
      expect(
        await screen.findByTestId("usage-analytics-dashboard"),
      ).toBeInTheDocument();
    });
  });

  describe("for non-admins", () => {
    it("renders nothing", async () => {
      setup({
        enableAuditAppPlugin: true,
        isForADashboard: true,
        isUserAdmin: false,
      });
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
