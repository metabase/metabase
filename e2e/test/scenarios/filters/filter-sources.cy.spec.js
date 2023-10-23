import {
  filter,
  getNotebookStep,
  popover,
  restore,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const tableQuestion = {
  dataset_query: {
    type: "query",
    query: { "source-table": ORDERS_ID },
    database: SAMPLE_DB_ID,
  },
};

const tableQuestionWithExpression = {
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        Total100: ["+", ["field", ORDERS.TOTAL, null], 100],
      },
    },
    database: SAMPLE_DB_ID,
  },
};

describe("scenarios > filters > filter sources", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("tables", () => {
    it("table column", () => {
      visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
      filter({ mode: "notebook" });
      popover().within(() => {
        cy.findByText("Tax").click();
        cy.findByPlaceholderText("Enter a number").type("6.1");
        cy.button("Add filter").click();
      });
      getNotebookStep("filter")
        .findByText("Tax is equal to 6.1")
        .should("be.visible");
      visualize();
      cy.findByTestId("view-footer")
        .findByText("Showing 10 rows")
        .should("be.visible");
    });

    it("expression on a table column", () => {
      visitQuestionAdhoc(tableQuestionWithExpression, { mode: "notebook" });
      filter({ mode: "notebook" });
      popover().within(() => {
        cy.findByText("Total100").click();
        cy.findByDisplayValue("Equal to").click();
      });
      cy.findByRole("listbox").findByText("Greater than").click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("250.5");
        cy.button("Add filter").click();
      });
      getNotebookStep("filter")
        .findByText("Total100 is greater than 250.5")
        .should("be.visible");
      visualize();
      cy.findByTestId("view-footer")
        .findByText("Showing 239 rows")
        .should("be.visible");
    });
  });
});
