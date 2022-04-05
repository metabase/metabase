import {
  restore,
  navigationSidebar,
  openNavigationSidebar,
  visitDashboard,
} from "__support__/e2e/cypress";

describe("scenarios > dashboard > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add and then remove bookmark", () => {
    visitDashboard(1);
    openNavigationSidebar();

    cy.get("main header").within(() => {
      cy.icon("ellipsis").click();
    });

    cy.findByText("Bookmark").click();

    navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard");
    });

    cy.get("main header").within(() => {
      cy.icon("ellipsis").click();
    });

    cy.findByText("Remove bookmark").click();

    navigationSidebar().within(() => {
      cy.findByText("Orders in a dashboard").should("not.exist");
    });
  });
});
