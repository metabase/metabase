import { restore } from "__support__/e2e/cypress";

const visitOptions = {
  onBeforeLoad(window) {
    window.Cypress = undefined;
  },
};

describe("scenarios > embedding > full app", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", `/api/card/*/query`).as("getCardQuery");
  });

  describe("navigation", () => {
    it("should hide top nav by default", () => {
      cy.visit("/", visitOptions);
      cy.findByTestId("main-logo").should("not.exist");
    });

    it("should show top nav when configured", () => {
      cy.visit("/?top_nav=true", visitOptions);
      cy.findAllByTestId("main-logo").should("be.visible");
      cy.findByRole("button", { name: /New/ }).should("not.exist");
      cy.findByPlaceholderText("Search").should("not.exist");
    });

    it("should show question creation controls when configured", () => {
      cy.visit("/?top_nav=true&new_button=true", visitOptions);
      cy.findByRole("button", { name: /New/ }).should("be.visible");
    });

    it("should show search controls when configured", () => {
      cy.visit("/?top_nav=true&search=true", visitOptions);
      cy.findByPlaceholderText("Search…").should("be.visible");
    });
  });

  describe("questions", () => {
    it("should show the question header by default", () => {
      cy.visit("/question/1", visitOptions);
      cy.wait("@getCardQuery");
      cy.findByTestId("qb-header").should("be.visible");
    });

    it("should hide the question header when configured", () => {
      cy.visit("/question/1?header=false", visitOptions);
      cy.wait("@getCardQuery");
      cy.findByTestId("qb-header").should("not.exist");
    });
  });
});
