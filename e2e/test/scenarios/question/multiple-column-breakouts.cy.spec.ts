import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  assertQueryBuilderRowCount,
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  openNotebook,
  popover,
  restore,
  startNewQuestion,
  tableInteractive,
  tableInteractiveBody,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const breakoutQuestionDetails: StructuredQuestionDetails = {
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "table",
  visualization_settings: {
    "table.pivot": false,
  },
};

describe("scenarios > question > multiple column breakouts", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("current stage", () => {
    describe("notebook", () => {
      it("should allow to create a query with multiple breakouts", () => {
        startNewQuestion();
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
          cy.findByText("Orders").click();
        });
        getNotebookStep("summarize")
          .findByText("Pick the metric you want to see")
          .click();
        popover().findByText("Count of rows").click();
        getNotebookStep("summarize")
          .findByText("Pick a column to group by")
          .click();
        popover().findByText("by month").click();
        popover().last().findByText("Year").click();
        getNotebookStep("summarize")
          .findByTestId("breakout-step")
          .icon("add")
          .click();
        popover().findByText("by month").click();
        popover().last().findByText("Month").click();
        visualize();
        assertQueryBuilderRowCount(49);
      });

      it("should allow to sort by breakout columns", () => {
        createQuestion(breakoutQuestionDetails, { visitQuestion: true });
        openNotebook();
        getNotebookStep("summarize").findByText("Sort").click();
        popover().findByText("Created At: Year").click();
        getNotebookStep("sort").button("Change direction").click();
        getNotebookStep("sort").icon("add").click();
        popover().findByText("Created At: Month").click();
        visualize();
        assertTableData({
          columns: ["Created At: Year", "Created At: Month", "Count"],
          rows: [
            ["2026", "January 2026", "580"],
            ["2026", "February 2026", "543"],
          ],
        });
      });
    });
  });
});

interface TableOpts {
  columns: string[];
  rows: string[][];
}

function assertTableData({ columns, rows }: TableOpts) {
  tableInteractive()
    .findAllByTestId("header-cell")
    .should("have.length", columns.length);

  columns.forEach((column, index) => {
    tableInteractive()
      .findAllByTestId("header-cell")
      .eq(index)
      .should("have.text", column);
  });

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      tableInteractiveBody()
        .findAllByTestId("cell-data")
        .eq(columns.length * rowIndex + cellIndex)
        .should("have.text", cell);
    });
  });
}
