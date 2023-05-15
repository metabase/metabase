import {
  restore,
  describeEE,
  popover,
  visitDashboard,
  rightSidebar,
} from "e2e/support/helpers";

describeEE("scenarios > dashboard > caching", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", "/api/setting/enable-query-caching", { value: true });
  });

  it("can set cache ttl for a saved question", () => {
    cy.intercept("PUT", "/api/dashboard/1").as("updateDashboard");
    visitDashboard(1);

    openDashboardInfo();

    rightSidebar().within(() => {
      cy.findByText(/Cache Configuration/).click();
    });

    popover().within(() => {
      cy.findByPlaceholderText("24").clear().type("48").blur();
      cy.button("Save changes").click();
    });

    cy.wait("@updateDashboard");
    cy.reload();

    openDashboardInfo();

    rightSidebar().within(() => {
      cy.findByText(/Cache Configuration/).click();
    });

    popover().within(() => {
      cy.findByDisplayValue("48").clear().type("0").blur();
      cy.button("Save changes").click();
    });

    cy.wait("@updateDashboard");
    cy.reload();

    openDashboardInfo();

    rightSidebar().within(() => {
      cy.findByText(/Cache Configuration/).click();
    });

    popover().within(() => {
      cy.findByPlaceholderText("24");
    });
  });
});

function openDashboardInfo() {
  cy.get("main header").within(() => {
    cy.icon("info").click();
  });
}
