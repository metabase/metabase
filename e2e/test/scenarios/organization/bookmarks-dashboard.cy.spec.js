import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  navigationSidebar,
  openDashboardMenu,
  openNavigationSidebar,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

describe("scenarios > dashboard > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add, update bookmark name when dashboard name is updated, and then remove bookmark", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    openNavigationSidebar();

    // Add bookmark
    openDashboardMenu();
    popover().findByText("Bookmark").click();

    navigationSidebar()
      .findByLabelText("Bookmarks")
      .findByText("Orders in a dashboard");

    // Rename bookmarked dashboard
    cy.findByTestId("dashboard-name-heading").click().type(" 2").blur();

    navigationSidebar()
      .findByLabelText("Bookmarks")
      .findByText("Orders in a dashboard 2");

    // Remove bookmark
    openDashboardMenu();
    popover().findByText("Remove from bookmarks").click();

    navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard 2").should("not.exist");
    });
  });
});
