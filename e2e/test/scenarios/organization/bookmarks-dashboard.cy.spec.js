import { H } from "e2e/support";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > dashboard > bookmarks", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should add, update bookmark name when dashboard name is updated, and then remove bookmark", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.openNavigationSidebar();

    // Add bookmark
    cy.get("main header").icon("bookmark").click();

    H.navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard");
    });

    // Rename bookmarked dashboard
    cy.findByTestId("dashboard-name-heading").click().type(" 2").blur();

    H.navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard 2");
    });

    // Remove bookmark
    cy.get("main header").icon("bookmark_filled").click();

    H.navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard 2").should("not.exist");
    });
  });
});
