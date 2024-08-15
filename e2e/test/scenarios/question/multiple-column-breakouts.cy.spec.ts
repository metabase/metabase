import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertQueryBuilderRowCount,
  createQuestion,
  createQuestionAndDashboard,
  dragField,
  editDashboard,
  entityPickerModal,
  entityPickerModalTab,
  filterWidget,
  getDashboardCard,
  getNotebookStep,
  openNotebook,
  popover,
  restore,
  saveDashboard,
  startNewQuestion,
  type StructuredQuestionDetails,
  summarize,
  tableHeaderClick,
  tableInteractive,
  tableInteractiveBody,
  visitDashboard,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionWith2BreakoutsDetails: StructuredQuestionDetails = {
  name: "Test question",
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

const questionWith5BreakoutsAndLimitDetails: StructuredQuestionDetails = {
  name: "Test question",
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
        { "base-type": "type/DateTime", "temporal-unit": "quarter" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "week" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "day" },
      ],
    ],
    limit: 10,
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
    cy.intercept("POST", "/api/dataset/pivot").as("pivotDataset");
    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
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
        createQuestion(questionWith2BreakoutsDetails, { visitQuestion: true });
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
        createQuestion(questionWith2BreakoutsDetails, { visitQuestion: true });
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
        createQuestion(questionWith2BreakoutsDetails, { visitQuestion: true });

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

    describe("viz settings", () => {
      it("should be able to change formatting settings for breakouts of the same column", () => {
        createQuestion(questionWith2BreakoutsDetails, { visitQuestion: true });

        cy.log("first breakout");
        tableHeaderClick("Created At: Year");
        popover().icon("gear").click();
        popover().findByDisplayValue("Created At: Year").clear().type("Year");
        cy.get("body").click();

        cy.log("second breakout");
        tableHeaderClick("Created At: Month");
        popover().icon("gear").click();
        popover().findByDisplayValue("Created At: Month").clear().type("Month");
        cy.get("body").click();

        assertTableData({ columns: ["Year", "Month", "Count"] });
      });

      it("should be able to change pivot split settings when there are more than 2 breakouts", () => {
        createQuestion(questionWith5BreakoutsAndLimitDetails, {
          visitQuestion: true,
        });

        cy.log("change display and assert the default settings");
        cy.findByTestId("viz-type-button").click();
        cy.findByTestId("chart-type-sidebar")
          .findByTestId("Pivot Table-button")
          .click();
        cy.wait("@pivotDataset");
        cy.findByTestId("pivot-table")
          .should("contain.text", "Created At: Month")
          .and("contain.text", "Created At: Week")
          .and("contain.text", "Created At: Day");

        cy.log("move a column from rows to columns");
        cy.findByTestId("viz-settings-button").click();
        dragField(2, 3);
        cy.wait("@pivotDataset");
        cy.findByTestId("pivot-table")
          .should("contain.text", "Created At: Month")
          .and("contain.text", "Created At: Week")
          .and("not.contain.text", "Created At: Day");

        cy.log("move a column from columns to rows");
        dragField(4, 1);
        cy.wait("@pivotDataset");
        cy.findByTestId("pivot-table")
          .should("contain.text", "Created At: Month")
          .and("contain.text", "Created At: Quarter")
          .and("contain.text", "Created At: Week");
      });
    });

    describe("dashboards", () => {
      it("should be able to use temporal-unit parameters with multiple breakouts of a column", () => {
        createQuestionAndDashboard({
          questionDetails: questionWith2BreakoutsDetails,
        }).then(({ body: { dashboard_id } }) => {
          visitDashboard(dashboard_id);
          cy.wait("@dashcardQuery");
        });

        cy.log("add parameters");
        editDashboard();
        addTemporalUnitParameter();
        getDashboardCard().findByText("Select…").click();
        popover().findAllByText("Created At").eq(0).click();
        addTemporalUnitParameter();
        getDashboardCard().findByText("Select…").click();
        popover().findAllByText("Created At").eq(1).click();
        saveDashboard();

        cy.log("set parameter values and check query results");
        filterWidget().eq(0).click();
        popover().findByText("Quarter").click();
        cy.wait("@dashcardQuery");
        filterWidget().eq(1).click();
        popover().findByText("Week").click();
        cy.wait("@dashcardQuery");
        getDashboardCard().within(() => {
          cy.findByText("Created At: Quarter").should("be.visible");
          cy.findByText("Created At: Week").should("be.visible");
        });

        cy.log("drill-thru to the QB and check query results");
        getDashboardCard().findByText("Test question").click();
        cy.wait("@dataset");
        tableInteractive().within(() => {
          cy.findByText("Created At: Quarter").should("be.visible");
          cy.findByText("Created At: Week").should("be.visible");
        });
        assertQueryBuilderRowCount(223);
      });
    });
  });
});

function addTemporalUnitParameter() {
  cy.findByTestId("dashboard-header")
    .findByLabelText("Add a Unit of Time widget")
    .click();
}

interface TableOpts {
  columns?: string[];
  rows?: string[][];
}

function assertTableData({ columns = [], rows = [] }: TableOpts) {
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
