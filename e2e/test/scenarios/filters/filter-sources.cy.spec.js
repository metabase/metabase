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
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: { "source-table": ORDERS_ID },
  },
  visualization_settings: {},
};

const tableQuestionWithExpression = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        Total100: ["+", ["field", ORDERS.TOTAL, null], 100],
      },
    },
  },
  visualization_settings: {},
};

const tableWithAggregations = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }]],
      ],
      breakout: [["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }]],
    },
  },
  visualization_settings: {},
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

    it("column from a nested aggregation without column", () => {
      visitQuestionAdhoc(tableWithAggregations, { mode: "notebook" });
      getNotebookStep("summarize").findByText("Filter").click();
      popover().within(() => {
        cy.findByText("Count").click();
        cy.findByPlaceholderText("Enter a number").type("90");
        cy.button("Add filter").click();
      });
      verifyFilterName("Count is equal to 90", { stage: 1 });
      visualize();
      verifyRowCount(7);
    });

    it("column from a nested aggregation with column", () => {
      visitQuestionAdhoc(tableWithAggregations, { mode: "notebook" });
      getNotebookStep("summarize").findByText("Filter").click();
      popover().findByText("Sum of Quantity").click();
      selectOperator("Less than");
      popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("350");
        cy.button("Add filter").click();
      });
      verifyFilterName("Sum of Quantity is less than 350", { stage: 1 });
      visualize();
      verifyRowCount(115);
    });

    it("column from a nested breakout", () => {
      visitQuestionAdhoc(tableWithAggregations, { mode: "notebook" });
      getNotebookStep("summarize").findByText("Filter").click();
      popover().within(() => {
        cy.findByText("Product ID").click();
        cy.findByPlaceholderText("Enter an ID").type("10");
        cy.button("Add filter").click();
      });
      verifyFilterName("Product ID is 10", { stage: 1 });
      visualize();
      verifyRowCount(1);
    });
  });
});

function selectOperator(operatorName) {
  cy.findByTestId("filter-operator-picker").click();
  cy.findByRole("listbox").findByText(operatorName).click();
}

function verifyFilterName(filterName, options) {
  getNotebookStep("filter", options)
    .findByText(filterName)
    .should("be.visible");
}

function verifyRowCount(rowCount) {
  cy.findByTestId("question-row-count").should(
    "contain",
    `Showing ${rowCount} row`,
  );
}
