import { restore } from "__support__/e2e/cypress";

describe("collections sidebar (metabase#15006)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/collection/root");
  });

  describe("in desktop form factors", () => {
    it("should display collections sidebar on page load", () => {
      cy.findByText("First collection").should("be.visible");
    });

    it("should not be able to close collections sidebar from sidebar itself", () => {
      cy.icon("close").should("not.be.visible");
    });

    it("should not be able to toggle collections sidebar from burger icon", () => {
      cy.icon("burger").should("not.be.visible");
    });
  });

  describe("in mobile form factors", () => {
    beforeEach(() => {
      cy.viewport(480, 800);
    });

    it("should not display collections sidebar on page load", () => {
      cy.findByText("First collection").should("not.be.visible");
    });

    it("should be able to toggle collections sidebar from burger icon", () => {
      cy.icon("burger").click();

      cy.findByText("First collection").should("be.visible");
      cy.icon("burger").should("not.be.visible");
    });

    it("should be able to close collections sidebar from sidebar itself", () => {
      cy.icon("burger").click();
      cy.icon("close").click();
      cy.icon("burger").should("be.visible");
    });
  });
});
