import {
  restore,
  navigationSidebar,
  openNavigationSidebar,
  closeNavigationSidebar,
} from "__support__/e2e/cypress";

describe("collections sidebar (metabase#15006)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(480, 800);
    cy.intercept("GET", "/api/collection/*").as("fetchCollections");
    cy.visit("/collection/root");
  });

  it("should be able to toggle collections sidebar when switched to mobile screen size", () => {
    cy.wait("@fetchCollections");
    navigationSidebar().should("have.attr", "aria-hidden", "true");
    openNavigationSidebar();

    navigationSidebar().within(() => {
      cy.findByText("First collection");
    });

    closeNavigationSidebar();
    navigationSidebar().should("have.attr", "aria-hidden", "true");
  });

  it("should close collections sidebar when collection is clicked in mobile screen size", () => {
    cy.wait("@fetchCollections");
    openNavigationSidebar();

    navigationSidebar().within(() => {
      cy.findByText("First collection").click();
    });
    cy.wait("@fetchCollections");

    navigationSidebar().should("have.attr", "aria-hidden", "true");
    cy.findByTestId("collection-name-heading").should(
      "have.text",
      "First collection",
    );
  });
});
