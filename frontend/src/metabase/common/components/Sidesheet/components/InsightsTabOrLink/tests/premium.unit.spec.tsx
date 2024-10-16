import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (props: Omit<SetupOpts, "enableAuditAppPlugin">) => {
  return baseSetup({
    enableAuditAppPlugin: true,
    ...props,
  });
};

describe("InsightsTabOrLink (EE with token)", () => {
  describe("for admins", () => {
    it("renders a link for a dashboard", async () => {
      const { history } = await setup({
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
      const { history } = await setup({
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
      await setup({
        isForADashboard: true,
        isUserAdmin: false,
      });
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
