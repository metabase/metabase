import { restore, startNewQuestion } from "e2e/support/helpers";

const MONGO_DB_NAME = "QA Mongo4";

describe("issue 15946", { tags: "@mongo" }, () => {
  before(() => {
    restore("mongo-4");
    cy.signInAsAdmin();

    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(MONGO_DB_NAME).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
  });

  it("converting a question to the native query should pre-select a table (metabase#15946)", () => {
    cy.get(".QueryBuilder .Icon-sql").click();

    cy.get(".Modal")
      .findByText("Convert this question to a native query")
      .click();
    cy.get(".Modal").should("not.exist");

    cy.get(".GuiBuilder-data").contains(MONGO_DB_NAME);
    cy.get(".GuiBuilder-data").contains("Orders");
    cy.get("aside .RunButton").should("not.be.disabled");
  });
});
