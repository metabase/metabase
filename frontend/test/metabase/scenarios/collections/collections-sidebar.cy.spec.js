import { restore } from "__support__/e2e/cypress";

describe("collections sidebar (metabase#15006)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/collection/root");
  });

  describe("in desktop form factors", () => {
    it("should not be able to toggle collections sidebar visibility", () => {
      cy.icon("close").should("not.be.visible");
      cy.icon("burger").should("not.be.visible");
    });
  });

  describe("in mobile form factors", () => {
    beforeEach(() => {
      cy.viewport(480, 800);
    });

    it("should not display sidebar on page load, and enable opening and closing it via clicks", () => {
      cy.findByText("First collection").should("not.be.visible");
      openSidebarFromBurgerIcon();
      closeSidebarFromCloseIcon();
    });
  });
});

function openSidebarFromBurgerIcon() {
  cy.icon("burger").click();

  cy.findByText("First collection").should("be.visible");
  cy.icon("burger").should("not.be.visible");
}

function closeSidebarFromCloseIcon() {
  cy.icon("close").click();
  cy.icon("burger").should("be.visible");
}
