import userEvent from "@testing-library/user-event";
import { screen, within } from "__support__/ui";

import { setup, TEST_DASHBOARD, TEST_DASHBOARD_WITH_TABS } from "./setup";

// console.warn = jest.fn();
// console.error = jest.fn();

describe("DashboardHeader", () => {
  it("should display `Export as PDF` when there is a single dashboard tab", async () => {
    await setup({
      dashboard: TEST_DASHBOARD,
    });

    userEvent.click(screen.getByLabelText("dashboard-menu-button"));

    const exportPdfButton = within(
      screen.getByTestId("dashboard-export-pdf-button"),
    );
    expect(exportPdfButton.getByText("Export as PDF")).toBeInTheDocument();
  });

  it("should display `Export tab as PDF` when there are multiple dashboard tabs", async () => {
    await setup({
      dashboard: TEST_DASHBOARD_WITH_TABS,
    });

    userEvent.click(screen.getByLabelText("dashboard-menu-button"));

    const exportPdfButton = within(
      screen.getByTestId("dashboard-export-pdf-button"),
    );
    expect(exportPdfButton.getByText("Export tab as PDF")).toBeInTheDocument();
  });

  it("should not show subscriptions button for non-admin users - when email and slack are not configured", async () => {
    await setup({
      isAdmin: false,
      email: false,
      slack: false,
    });

    expect(screen.queryByLabelText("subscriptions")).not.toBeInTheDocument();
  });

  it("should show subscriptions button for admins - even when email and slack are not configured", async () => {
    await setup({
      isAdmin: true,
      email: false,
      slack: false,
    });

    expect(screen.getByLabelText("subscriptions")).toBeInTheDocument();
  });
});
