import { restore, saveQuestion, startNewQuestion } from "e2e/support/helpers";

const MONGO_DB_NAME = "QA Mongo4";

describe("issue 32121", () => {
  describe("on SQL questions", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("clicking 'Explore results' works (metabase#32121)", () => {
      // Stepping all the way through the QB because I couldn't repro with canned `createNativeQuestion` JSON.
      startNewQuestion();

      // Query the entire Orders table, then convert to SQL.
      cy.get("#DataPopover").findByText("Sample Database").click();
      cy.get("#DataPopover").findByText("Orders").click();
      cy.findByTestId("qb-header").find(".Icon-sql").click();
      cy.get(".Modal").findByText("Convert this question to SQL").click();

      // Run the query.
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByTestId("native-query-editor-container").icon("play").click();
      cy.wait("@dataset");
      cy.findByTestId("question-row-count").contains(
        "Showing first 2,000 rows",
      );

      // Save it.
      saveQuestion("all Orders");

      cy.findByTestId("qb-header").findByText("Explore results").click();
      cy.findByTestId("question-row-count").contains(
        "Showing first 2,000 rows",
      );
    });
  });

  describe("on native Mongo questions", { tags: "@external" }, () => {
    before(() => {
      restore("mongo-4");
      cy.signInAsAdmin();

      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(MONGO_DB_NAME).click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").click();
    });

    it("convert GUI question to native query, and 'Explore results' works (metabase#32121)", () => {
      cy.get(".QueryBuilder .Icon-sql").click();

      cy.get(".Modal")
        .findByText("Convert this question to a native query")
        .click();
      cy.get(".Modal").should("not.exist");

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByTestId("native-query-editor-container").icon("play").click();
      cy.wait("@dataset");

      saveQuestion("all Orders");

      cy.findByTestId("question-row-count").contains(
        "Showing first 2,000 rows",
      );

      cy.findByTestId("qb-header").findByText("Explore results").click();
      cy.findByTestId("question-row-count").contains(
        "Showing first 2,000 rows",
      );
    });
  });
});
