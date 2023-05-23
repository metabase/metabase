import {
  restore,
  runNativeQuery,
  summarize,
  popover,
  openQuestionActions,
} from "e2e/support/helpers";

import { selectFromDropdown } from "./helpers/e2e-models-helpers";

describe("scenarios > models query editor", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    restore();
    cy.signInAsAdmin();
  });

  describe("GUI models", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/card/1", {
        name: "Orders Model",
        dataset: true,
      });
    });

    it("allows to edit GUI model query", () => {
      cy.visit("/model/1");
      cy.wait("@dataset");

      cy.get(".cellData").should("contain", "37.65").and("contain", "109.22");

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit query definition").click();
      });

      cy.findByTestId("data-step-cell").contains("Orders");
      cy.button("Save changes").should("be.disabled");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Row limit").click();
      cy.findByPlaceholderText("Enter a limit").type("2");

      cy.get(".RunButton").click();
      cy.wait("@dataset");

      cy.get(".cellData")
        .should("contain", "37.65")
        .and("not.contain", "109.22");

      cy.button("Save changes").click();
      cy.wait("@updateCard");

      cy.url().should("include", "/model/1").and("not.include", "/query");
      cy.location("hash").should("eq", "");

      cy.get(".cellData")
        .should("contain", "37.65")
        .and("not.contain", "109.22");
    });

    it("allows for canceling changes", () => {
      cy.visit("/model/1");
      cy.wait("@dataset");

      cy.get(".cellData").should("contain", "37.65").and("contain", "109.22");

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit query definition").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Row limit").click();
      cy.findByPlaceholderText("Enter a limit").type("2");

      cy.get(".RunButton").click();
      cy.wait("@dataset");

      cy.get(".cellData")
        .should("contain", "37.65")
        .and("not.contain", "109.22");

      cy.button("Cancel").click();
      cy.wait("@cardQuery");

      cy.url().should("include", "/model/1").and("not.include", "/query");
      cy.location("hash").should("eq", "");

      cy.get(".cellData").should("contain", "37.65").and("contain", "109.22");
    });

    it("locks display to table", () => {
      cy.visit("/model/1/query");

      summarize({ mode: "notebook" });

      selectFromDropdown("Count of rows");

      cy.get(".RunButton").click();
      cy.wait("@dataset");

      // FE chooses the scalar visualization to display count of rows for regular questions
      cy.get(".TableInteractive");
      cy.get(".ScalarValue").should("not.exist");
    });
  });

  describe("native models", () => {
    it("allows to edit native model query", () => {
      cy.createNativeQuestion(
        {
          name: "Native Model",
          dataset: true,
          native: {
            query: "SELECT * FROM orders limit 5",
          },
        },
        { visitQuestion: true },
      );

      cy.get(".cellData").should("contain", "37.65").and("contain", "109.22");

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit query definition").click();
      });

      cy.url().should("include", "/query");
      cy.button("Save changes").should("be.disabled");

      cy.get(".ace_content").type("{backspace}2");

      runNativeQuery();

      cy.get(".cellData")
        .should("contain", "37.65")
        .and("not.contain", "109.22");

      cy.button("Save changes").click();
      cy.wait("@updateCard");

      cy.get(".cellData")
        .should("contain", "37.65")
        .and("not.contain", "109.22");
    });

    it("allows for canceling changes", () => {
      cy.createNativeQuestion(
        {
          name: "Native Model",
          dataset: true,
          native: {
            query: "SELECT * FROM orders limit 5",
          },
        },
        { visitQuestion: true },
      );

      cy.get(".cellData").should("contain", "37.65").and("contain", "109.22");

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit query definition").click();
      });

      cy.url().should("include", "/query");
      cy.button("Save changes").should("be.disabled");

      cy.get(".ace_content").type("{backspace}2");

      runNativeQuery();

      cy.get(".cellData")
        .should("contain", "37.65")
        .and("not.contain", "109.22");

      cy.button("Cancel").click();
      cy.wait("@cardQuery");

      cy.get(".cellData").should("contain", "37.65").and("contain", "109.22");
    });

    it("handles failing queries", () => {
      cy.createNativeQuestion(
        {
          name: "Erroring Model",
          dataset: true,
          native: {
            // Let's use API to type the most of the query, but stil make it invalid
            query: "SELECT 1 FROM",
          },
        },
        { visitQuestion: true },
      );

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit metadata").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Syntax error in SQL/).should("be.visible");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Query").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Syntax error in SQL/).should("be.visible");

      cy.get(".ace_content").type("{backspace}".repeat(" FROM".length));
      runNativeQuery();

      cy.get(".cellData").contains(1);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Syntax error in SQL/).should("not.exist");

      cy.button("Save changes").click();
      cy.wait("@updateCard");

      cy.get(".cellData").contains(1);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Syntax error in SQL/).should("not.exist");
    });
  });
});
