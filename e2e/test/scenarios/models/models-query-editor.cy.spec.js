import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  modal,
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
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        name: "Orders Model",
        type: "model",
      });
    });

    it("allows to edit GUI model query", () => {
      cy.visit(`/model/${ORDERS_QUESTION_ID}`);
      cy.wait("@dataset");

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("contain", "109.22");

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit query definition").click();
      });

      cy.findByTestId("data-step-cell").contains("Orders");
      cy.button("Save changes").should("be.disabled");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Row limit").click();
      cy.findByPlaceholderText("Enter a limit").type("2").blur();

      cy.findByTestId("run-button").click();
      cy.wait("@dataset");

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("not.contain", "109.22");

      cy.button("Save changes").click();
      cy.wait("@updateCard");

      cy.url()
        .should("include", `/model/${ORDERS_QUESTION_ID}`)
        .and("not.include", "/query");
      cy.location("hash").should("eq", "");

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("not.contain", "109.22");
    });

    it("allows for canceling changes", () => {
      cy.visit(`/model/${ORDERS_QUESTION_ID}`);
      cy.wait("@dataset");

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("contain", "109.22");

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit query definition").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Row limit").click();
      cy.findByPlaceholderText("Enter a limit").type("2").blur();

      cy.findByTestId("run-button").click();
      cy.wait("@dataset");

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("not.contain", "109.22");

      cy.button("Cancel").click();
      modal().button("Discard changes").click();
      cy.wait("@cardQuery");

      cy.url()
        .should("include", `/model/${ORDERS_QUESTION_ID}`)
        .and("not.include", "/query");
      cy.location("hash").should("eq", "");

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("contain", "109.22");
    });

    it("locks display to table", () => {
      cy.visit(`/model/${ORDERS_QUESTION_ID}/query`);

      summarize({ mode: "notebook" });

      selectFromDropdown("Count of rows");

      cy.findByTestId("run-button").click();
      cy.wait("@dataset");

      // FE chooses the scalar visualization to display count of rows for regular questions
      // TODO (styles): migrate
      cy.get(".test-TableInteractive");
      cy.findByTestId("scalar-value").should("not.exist");
    });
  });

  describe("native models", () => {
    it("allows to edit native model query", () => {
      cy.createNativeQuestion(
        {
          name: "Native Model",
          type: "model",
          native: {
            query: "SELECT * FROM orders limit 5",
          },
        },
        { visitQuestion: true },
      );

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("contain", "109.22");

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit query definition").click();
      });

      cy.url().should("include", "/query");
      cy.button("Save changes").should("be.disabled");

      cy.get(".ace_content").type("{backspace}2");

      runNativeQuery();

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("not.contain", "109.22");

      cy.button("Save changes").click();
      cy.wait("@updateCard");

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("not.contain", "109.22");
    });

    it("allows for canceling changes", () => {
      cy.createNativeQuestion(
        {
          name: "Native Model",
          type: "model",
          native: {
            query: "SELECT * FROM orders limit 5",
          },
        },
        { visitQuestion: true },
      );

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("contain", "109.22");

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Edit query definition").click();
      });

      cy.url().should("include", "/query");
      cy.button("Save changes").should("be.disabled");

      cy.get(".ace_content").type("{backspace}2");

      runNativeQuery();

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("not.contain", "109.22");

      cy.button("Cancel").click();
      modal().button("Discard changes").click();
      cy.wait("@cardQuery");

      cy.get("[data-testid=cell-data]")
        .should("contain", "37.65")
        .and("contain", "109.22");
    });

    it("handles failing queries", () => {
      cy.createNativeQuestion(
        {
          name: "Erroring Model",
          type: "model",
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

      cy.get("[data-testid=cell-data]").contains(1);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Syntax error in SQL/).should("not.exist");

      cy.button("Save changes").click();
      cy.wait("@updateCard");

      cy.get("[data-testid=cell-data]").contains(1);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Syntax error in SQL/).should("not.exist");
    });
  });
});
