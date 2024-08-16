import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertQueryBuilderRowCount,
  createQuestion,
  createQuestionAndDashboard,
  type DashboardDetails,
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
  visitEmbeddedPage,
  visitPublicDashboard,
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

const dashboardDetails: DashboardDetails = {
  parameters: [
    {
      id: "1",
      name: "Unit1",
      slug: "unit1",
      type: "temporal-unit",
      sectionId: "temporal-unit",
    },
    {
      id: "2",
      name: "Unit2",
      slug: "unit2",
      type: "temporal-unit",
      sectionId: "temporal-unit",
    },
  ],
  enable_embedding: true,
  embedding_params: {
    unit1: "enabled",
    unit2: "enabled",
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
    cy.intercept("/api/public/dashboard/*/dashcard/*/card/*").as(
      "publicDashcardQuery",
    );
    cy.intercept("/api/embed/dashboard/*/dashcard/*/card/*").as(
      "embedDashcardQuery",
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
          firstRows: [
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
          firstRows: [["Q2 2022", "April 24, 2022 – April 30, 2022", "1"]],
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
          firstRows: [["Q2 2022", "April 2022", "1"]],
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
          firstRows: [["Q3 2023", "August 2023", "9"]],
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
          firstRows: [["Q3 2022", "August 2022", "1"]],
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
      function setParametersAndAssertResults(queryAlias: string) {
        filterWidget().eq(0).click();
        popover().findByText("Quarter").click();
        cy.wait(queryAlias);
        filterWidget().eq(1).click();
        popover().findByText("Week").click();
        cy.wait(queryAlias);
        getDashboardCard().within(() => {
          cy.findByText("Created At: Quarter").should("be.visible");
          cy.findByText("Created At: Week").should("be.visible");
        });
      }

      it("should be able to use temporal-unit parameters with multiple breakouts of a column", () => {
        cy.log("create dashboard");
        cy.signInAsAdmin();
        createQuestionAndDashboard({
          dashboardDetails,
          questionDetails: questionWith2BreakoutsDetails,
        }).then(({ body: { dashboard_id } }) => {
          cy.wrap(dashboard_id).as("dashboardId");
        });

        cy.log("visit dashboard");
        cy.signInAsNormalUser();
        visitDashboard("@dashboardId");
        cy.wait("@dashcardQuery");

        cy.log("add parameters");
        editDashboard();
        cy.findByTestId("fixed-width-filters").findByText("Unit1").click();
        getDashboardCard().findByText("Select…").click();
        popover().findAllByText("Created At").eq(0).click();
        cy.findByTestId("fixed-width-filters").findByText("Unit2").click();
        getDashboardCard().findByText("Select…").click();
        popover().findAllByText("Created At").eq(1).click();
        saveDashboard();
        cy.wait("@dashcardQuery");

        cy.log("set parameters and assert query results");
        setParametersAndAssertResults("@dashcardQuery");

        cy.log("drill-thru to the QB and assert query results");
        getDashboardCard().findByText("Test question").click();
        cy.wait("@dataset");
        tableInteractive().within(() => {
          cy.findByText("Created At: Quarter").should("be.visible");
          cy.findByText("Created At: Week").should("be.visible");
        });

        cy.log("set parameters in a public dashboard");
        cy.signInAsAdmin();
        cy.get("@dashboardId").then(visitPublicDashboard);
        cy.wait("@publicDashcardQuery");
        setParametersAndAssertResults("@publicDashcardQuery");

        cy.log("set parameters in an embedded dashboard");
        cy.get<number>("@dashboardId").then(dashboardId =>
          visitEmbeddedPage({
            resource: { dashboard: dashboardId },
            params: {},
          }),
        );
        cy.wait("@embedDashcardQuery");
        setParametersAndAssertResults("@embedDashcardQuery");
      });
    });
  });

  describe("previous stage", () => {
    describe("notebook", () => {
      it("should be able to add post-aggregation filters for each breakout column", () => {
        createQuestion(questionWith2BreakoutsDetails, { visitQuestion: true });
        openNotebook();

        cy.log("add a filter for the year column");
        getNotebookStep("summarize").button("Filter").click();
        popover().within(() => {
          cy.findByText("Created At: Year").click();
          cy.findByText("Specific dates…").click();
          cy.findByText("Between").click();
          cy.findByLabelText("Start date").clear().type("January 1, 2023");
          cy.findByLabelText("End date").clear().type("December 31, 2023");
          cy.button("Add filter").click();
        });

        cy.log("add a filter for the month column");
        getNotebookStep("filter", { stage: 1 }).icon("add").click();
        popover().within(() => {
          cy.findByText("Created At: Month").click();
          cy.findByText("Specific dates…").click();
          cy.findByText("Between").click();
          cy.findByLabelText("Start date").clear().type("March 1, 2023");
          cy.findByLabelText("End date").clear().type("May 31, 2023");
          cy.button("Add filter").click();
        });

        cy.log("assert query results");
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: ["Created At: Year", "Created At: Month", "Count"],
          firstRows: [
            ["2023", "March 2023", "256"],
            ["2023", "April 2023", "238"],
            ["2023", "May 2023", "271"],
          ],
        });
        assertQueryBuilderRowCount(3);
      });
    });
  });
});

interface TableOpts {
  columns: string[];
  firstRows?: string[][];
}

function assertTableData({ columns = [], firstRows = [] }: TableOpts) {
  tableInteractive()
    .findAllByTestId("header-cell")
    .should("have.length", columns.length);

  columns.forEach((column, index) => {
    tableInteractive()
      .findAllByTestId("header-cell")
      .eq(index)
      .should("have.text", column);
  });

  firstRows.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      tableInteractiveBody()
        .findAllByTestId("cell-data")
        .eq(columns.length * rowIndex + cellIndex)
        .should("have.text", cell);
    });
  });
}
