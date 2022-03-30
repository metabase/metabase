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
    cy.visit("/collection/root");
  });

  it("should be able to toggle collections sidebar when switched to mobile screen size", () => {
    navigationSidebar().should("have.attr", "aria-hidden", "true");
    openNavigationSidebar();

    navigationSidebar().within(() => {
      cy.findByText("First collection");
    });

    closeNavigationSidebar();
    navigationSidebar().should("have.attr", "aria-hidden", "true");
  });

  it("should close collections sidebar when collection is clicked in mobile screen size", () => {
    openNavigationSidebar();

    navigationSidebar().within(() => {
      cy.findByText("First collection").click();
    });

    navigationSidebar().should("have.attr", "aria-hidden", "true");
    cy.findByText("First collection");
  });
});
