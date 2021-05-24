import { restore, addMongoDatabase, modal } from "__support__/e2e/cypress";

const MONGO_DB_NAME = "QA Mongo4";

describe("mongodb > native query", () => {
  before(() => {
    restore();
    cy.signInAsAdmin();
    addMongoDatabase(MONGO_DB_NAME);
  });

  it.skip("converting a question to the native query should pre-select a table (metabase#15946)", () => {
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(MONGO_DB_NAME).click();
    cy.findByText("Orders").click();
    cy.get(".QueryBuilder .Icon-sql").click();
    modal()
      .findByText("Convert this question to a native query")
      .click();
    modal().should("not.exist");
    cy.get(".GuiBuilder-data").contains(MONGO_DB_NAME);
    cy.get(".GuiBuilder-data").contains("Orders");
  });
});
