import {
  restore,
  saveQuestion,
  startNewQuestion,
  openOrdersTable,
  openNotebook,
  popover,
} from "e2e/support/helpers";

const MONGO_DB_NAME = "QA Mongo";

describe("issue 32121", () => {
  describe("on SQL questions", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("clicking 'Explore results' works (metabase#32121)", () => {
      // Stepping all the way through the QB because I couldn't repro with canned `createNativeQuestion` JSON.
      openOrdersTable({ limit: 1 });
      openNotebook();
      cy.findByTestId("qb-header").icon("sql").click();
      cy.get("pre").should("exist");

      cy.button("Convert this question to SQL").click();

      cy.get(".cellData").contains("37.65");
      saveQuestion("foo");

      cy.findByTestId("qb-header").findByText("Explore results").click();
      cy.get(".cellData").contains("37.65");
    });
  });

  describe("on native Mongo questions", { tags: "@mongo" }, () => {
    before(() => {
      restore("mongo-5");
      cy.signInAsAdmin();
    });

    it("convert GUI question to native query, and 'Explore results' works (metabase#32121)", () => {
      startNewQuestion();
      popover().within(() => {
        cy.findByText("Raw Data").click();
        cy.findByText(MONGO_DB_NAME).click();
        cy.findByText("Orders").click();
      });
      cy.findByTestId("query-builder-root").icon("sql").click();
      cy.get("pre").should("exist");

      cy.button("Convert this question to a native query").click();

      cy.get(".cellData").contains("37.65");
      saveQuestion("foo");

      cy.findByTestId("qb-header").findByText("Explore results").click();
      cy.get(".cellData").contains("37.65");
    });
  });
});
