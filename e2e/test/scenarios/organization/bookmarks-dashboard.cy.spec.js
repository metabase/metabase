import {
  restore,
  navigationSidebar,
  openNavigationSidebar,
  visitDashboard,
} from "e2e/support/helpers";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > dashboard > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add, update bookmark name when dashboard name is updated, and then remove bookmark", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    openNavigationSidebar();

    // Add bookmark
    cy.get("main header").within(() => {
      cy.icon("bookmark").click();
    });

    navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard");
    });

    // Rename bookmarked dashboard
    cy.findByTestId("dashboard-name-heading").click().type(" 2").blur();

    navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard 2");
    });

    // Remove bookmark
    cy.get("main header").within(() => {
      cy.icon("bookmark").click();
    });

    navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard 2").should("not.exist");
    });
  });
});
