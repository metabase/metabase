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
    it("should hide the top nav by default", () => {
      cy.visit("/", visitOptions);
      cy.findByTestId("main-logo").should("not.exist");
    });

    it("should show the top nav by a param", () => {
      cy.visit("/?top_nav=true", visitOptions);
      cy.findAllByTestId("main-logo").should("be.visible");
      cy.button(/New/).should("not.exist");
      cy.findByPlaceholderText("Search").should("not.exist");
    });

    it("should show question creation controls by a param", () => {
      cy.visit("/?top_nav=true&new_button=true", visitOptions);
      cy.button(/New/).should("be.visible");
    });

    it("should show search controls by a param", () => {
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

    it("should hide the question header by a param", () => {
      cy.visit("/question/1?header=false", visitOptions);
      cy.wait("@getCardQuery");

      cy.findByTestId("qb-header").should("not.exist");
    });

    it("should hide the question's additional info by a param", () => {
      cy.visit("/question/1?additional_info=false", visitOptions);
      cy.wait("@getCardQuery");

      cy.findByText("Our analytics").should("not.exist");
    });

    it("should hide the question's action buttons by a param", () => {
      cy.visit("/question/1?action_buttons=false", visitOptions);
      cy.wait("@getCardQuery");

      cy.button("Summarize").should("not.exist");
      cy.button("Filter").should("not.exist");
      cy.icon("notebook").should("not.exist");
      cy.icon("refresh").should("be.visible");
    });
  });
});
