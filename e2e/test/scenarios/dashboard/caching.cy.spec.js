import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  describeEE,
  popover,
  visitDashboard,
  rightSidebar,
  setTokenFeatures,
  toggleDashboardInfoSidebar,
} from "e2e/support/helpers";

describeEE("scenarios > dashboard > caching", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.request("PUT", "/api/setting/enable-query-caching", { value: true });
  });

  it("can set cache ttl for a saved question", () => {
    cy.intercept("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`).as(
      "updateDashboard",
    );
    visitDashboard(ORDERS_DASHBOARD_ID);

    toggleDashboardInfoSidebar();

    rightSidebar().within(() => {
      cy.findByText(/Cache Configuration/).click();
    });

    popover().within(() => {
      cy.findByPlaceholderText("24").clear().type("48").blur();
      cy.button("Save changes").click();
    });

    cy.wait("@updateDashboard");
    cy.reload();

    toggleDashboardInfoSidebar();

    rightSidebar().within(() => {
      cy.findByText(/Cache Configuration/).click();
    });

    popover().within(() => {
      cy.findByDisplayValue("48").clear().type("0").blur();
      cy.button("Save changes").click();
    });

    cy.wait("@updateDashboard");
    cy.reload();

    toggleDashboardInfoSidebar();

    rightSidebar().within(() => {
      cy.findByText(/Cache Configuration/).click();
    });

    popover().within(() => {
      cy.findByPlaceholderText("24");
    });
  });
});
