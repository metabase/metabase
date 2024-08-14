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
  summarize,
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
    cy.intercept("POST", "/api/dataset").as("dataset");
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
        cy.wait("@dataset");
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
        cy.wait("@dataset");
        assertTableData({
          columns: ["Created At: Year", "Created At: Month", "Count"],
          rows: [
            ["2026", "January 2026", "580"],
            ["2026", "February 2026", "543"],
          ],
        });
      });
    });

    describe("summarize sidebar", () => {
      it("should allow to change temporal units for multiple breakouts of the same column", () => {
        createQuestion(breakoutQuestionDetails, { visitQuestion: true });
        summarize();
        cy.findByTestId("pinned-dimensions")
          .findAllByLabelText("Created At")
          .should("have.length", 2)
          .eq(0)
          .findByText("by year")
          .click();
        popover().findByText("Quarter").click();
        cy.wait("@dataset");
        cy.findByTestId("pinned-dimensions")
          .findAllByLabelText("Created At")
          .should("have.length", 2)
          .eq(1)
          .findByText("by month")
          .click();
        popover().findByText("Week").click();
        cy.wait("@dataset");
        assertTableData({
          columns: ["Created At: Quarter", "Created At: Week", "Count"],
          rows: [["Q2 2022", "April 24, 2022 – April 30, 2022", "1"]],
        });
      });
    });

    describe("timeseries chrome", () => {
      it("should use the first breakout for the chrome in case there are multiple for this column", () => {
        createQuestion(breakoutQuestionDetails, { visitQuestion: true });

        cy.log("change the breakout");
        cy.findByTestId("timeseries-bucket-button")
          .should("contain.text", "Year")
          .click();
        popover().findByText("Quarter").click();
        cy.wait("@dataset");
        assertQueryBuilderRowCount(49);
        assertTableData({
          columns: ["Created At: Quarter", "Created At: Month", "Count"],
          rows: [["Q2 2022", "April 2022", "1"]],
        });

        cy.log("add a filter");
        cy.findByTestId("timeseries-filter-button")
          .should("contain.text", "All time")
          .click();
        popover().findByDisplayValue("All time").click();
        popover().last().findByText("On").click();
        popover().within(() => {
          cy.findByLabelText("Date").clear().type("August 14, 2023");
          cy.button("Apply").click();
        });
        cy.wait("@dataset");
        assertQueryBuilderRowCount(1);
        assertTableData({
          columns: ["Created At: Quarter", "Created At: Month", "Count"],
          rows: [["Q3 2023", "August 2023", "9"]],
        });

        cy.log("change the filter");
        cy.findByTestId("timeseries-filter-button")
          .should("contain.text", "Aug 14")
          .click();
        popover().within(() => {
          cy.findByLabelText("Date").clear().type("August 14, 2022");
          cy.button("Apply").click();
        });
        cy.wait("@dataset");
        assertQueryBuilderRowCount(1);
        assertTableData({
          columns: ["Created At: Quarter", "Created At: Month", "Count"],
          rows: [["Q3 2022", "August 2022", "1"]],
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
