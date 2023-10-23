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
      verifyFilterName("Tax is equal to 6.1");
      visualize();
      verifyRowCount(10);
    });

    it("expression based on a table column", () => {
      visitQuestionAdhoc(tableQuestionWithExpression, { mode: "notebook" });
      filter({ mode: "notebook" });
      popover().findByText("Total100").click();
      selectOperator("Greater than");
      popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("250.5");
        cy.button("Add filter").click();
      });
      verifyFilterName("Total100 is greater than 250.5");
      visualize();
      verifyRowCount(239);
    });

    it("column from an implicit join", () => {
      visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
      filter({ mode: "notebook" });
      popover().within(() => {
        cy.findByText("Product").click();
        cy.findByText("Ean").click();
        cy.findByText("0001664425970").click();
        cy.button("Add filter").click();
      });
      verifyFilterName("Product → Ean is 0001664425970");
      visualize();
      verifyRowCount(104);
    });
  });
});

function selectOperator(operatorName) {
  cy.findByTestId("filter-operator-picker").click();
  cy.findByRole("listbox").findByText(operatorName).click();
}

function verifyFilterName(filterName) {
  getNotebookStep("filter").findByText(filterName).should("be.visible");
}

function verifyRowCount(rowCount) {
  cy.findByTestId("question-row-count").should(
    "contain",
    `Showing ${rowCount} row`,
  );
}
