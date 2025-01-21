import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > dashboard > bookmarks", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should add, update bookmark name when dashboard name is updated, and then remove bookmark", () => {
    cy.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.openNavigationSidebar();

    // Add bookmark
    cy.get("main header").icon("bookmark").click();

    cy.navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard");
    });

    // Rename bookmarked dashboard
    cy.findByTestId("dashboard-name-heading").click().type(" 2").blur();

    cy.navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard 2");
    });

    // Remove bookmark
    cy.get("main header").icon("bookmark_filled").click();

    cy.navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard 2").should("not.exist");
    });
  });
});
