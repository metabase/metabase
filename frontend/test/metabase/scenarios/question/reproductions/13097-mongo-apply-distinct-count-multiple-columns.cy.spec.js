import { restore, visualize } from "__support__/e2e/cypress";

const MONGO_DB_NAME = "QA Mongo4";

describe.skip("issue 13097", () => {
  before(() => {
    restore("mongo-4");
    cy.signInAsAdmin();

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(MONGO_DB_NAME).click();
    cy.findByText("People").click();
  });

  it("should correctly apply distinct count on multiple columns (metabase#13097)", () => {
    cy.findByText("Pick the metric you want to see").click();
    cy.findByText("Number of distinct values of ...").click();
    cy.findByText("City").click();

    cy.get("[class*=NotebookCell]").within(() => {
      cy.icon("add").click();
    });

    cy.findByText("Number of distinct values of ...").click();
    cy.findByText("State").click();

    cy.intercept("POST", "/api/dataset").as("dataset");

    visualize();

    cy.log("Reported failing on stats ~v0.36.3");
    cy.findAllByText("1,966").should("have.length", 1); // City
    cy.findByText("49"); // State
  });
});
