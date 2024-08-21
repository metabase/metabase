import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertQueryBuilderRowCount,
  createQuestion,
  createQuestionAndDashboard,
  type DashboardDetails,
  dragField,
  editDashboard,
  enterCustomColumnDetails,
  entityPickerModal,
  entityPickerModalTab,
  filter,
  filterWidget,
  getDashboardCard,
  getNotebookStep,
  modal,
  openNotebook,
  popover,
  restore,
  saveDashboard,
  startNewQuestion,
  type StructuredQuestionDetails,
  summarize,
  tableInteractive,
  tableInteractiveBody,
  visitDashboard,
  visitEmbeddedPage,
  visitPublicDashboard,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

const questionWith2TemporalBreakoutsDetails: StructuredQuestionDetails = {
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

const multiStageQuestionWith2TemporalBreakoutsDetails: StructuredQuestionDetails =
  {
    name: "Test question",
    query: {
      "source-query": questionWith2TemporalBreakoutsDetails.query,
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    },
  };

const questionWith2NumBinsBreakoutsDetails: StructuredQuestionDetails = {
  name: "Test question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 10 },
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 50 },
        },
      ],
    ],
  },
  display: "table",
  visualization_settings: {
    "table.pivot": false,
  },
};

const multiStageQuestionWith2NumBinsBreakoutsDetails: StructuredQuestionDetails =
  {
    name: "Test question",
    query: {
      "source-query": questionWith2NumBinsBreakoutsDetails.query,
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    },
  };

const questionWith2BinWidthBreakoutsDetails: StructuredQuestionDetails = {
  name: "Test question",
  query: {
    "source-table": PEOPLE_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PEOPLE.LATITUDE,
        {
          "base-type": "type/Float",
          binning: { strategy: "bin-width", "bin-width": 20 },
        },
      ],
      [
        "field",
        PEOPLE.LATITUDE,
        {
          "base-type": "type/Float",
          binning: { strategy: "bin-width", "bin-width": 10 },
        },
      ],
    ],
  },
  display: "table",
  visualization_settings: {
    "table.pivot": false,
  },
};

const multiStageQuestionWith2BinWidthBreakoutsDetails: StructuredQuestionDetails =
  {
    name: "Test question",
    query: {
      "source-query": questionWith2BinWidthBreakoutsDetails.query,
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    },
  };

const questionWith5TemporalBreakoutsDetails: StructuredQuestionDetails = {
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

const questionWith5NumBinsBreakoutsDetails: StructuredQuestionDetails = {
  name: "Test question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "default" },
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 10 },
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 50 },
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 100 },
        },
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
        function testNewQueryWithBreakouts({
          tableName,
          columnName,
          bucketLabel,
          bucket1Name,
          bucket2Name,
        }: {
          tableName: string;
          columnName: string;
          bucketLabel: string;
          bucket1Name: string;
          bucket2Name: string;
        }) {
          startNewQuestion();
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
            cy.findByText(tableName).click();
          });
          getNotebookStep("summarize")
            .findByText("Pick the metric you want to see")
            .click();
          popover().findByText("Count of rows").click();
          getNotebookStep("summarize")
            .findByText("Pick a column to group by")
            .click();
          popover()
            .findByLabelText(columnName)
            .findByLabelText(bucketLabel)
            .click();
          popover().last().findByText(bucket1Name).click();
          getNotebookStep("summarize")
            .findByTestId("breakout-step")
            .icon("add")
            .click();
          popover()
            .findByLabelText(columnName)
            .findByLabelText(bucketLabel)
            .click();
          popover().last().findByText(bucket2Name).click();
          visualize();
          cy.wait("@dataset");
        }

        cy.log("temporal breakouts");
        testNewQueryWithBreakouts({
          tableName: "Orders",
          columnName: "Created At",
          bucketLabel: "Temporal bucket",
          bucket1Name: "Year",
          bucket2Name: "Month",
        });
        assertQueryBuilderRowCount(49);

        cy.log("'num-bins' breakouts");
        testNewQueryWithBreakouts({
          tableName: "Orders",
          columnName: "Total",
          bucketLabel: "Binning strategy",
          bucket1Name: "10 bins",
          bucket2Name: "50 bins",
        });
        assertQueryBuilderRowCount(32);

        cy.log("'bin-width' breakouts");
        testNewQueryWithBreakouts({
          tableName: "People",
          columnName: "Latitude",
          bucketLabel: "Binning strategy",
          bucket1Name: "Bin every 10 degrees",
          bucket2Name: "Bin every 20 degrees",
        });
        assertQueryBuilderRowCount(6);
      });

      it("should allow to sort by breakout columns", () => {
        function testSortByBreakout({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          createQuestion(questionDetails, {
            visitQuestion: true,
          });
          openNotebook();
          getNotebookStep("summarize").findByText("Sort").click();
          popover().findByText(column1Name).click();
          getNotebookStep("sort").button("Change direction").click();
          getNotebookStep("sort").icon("add").click();
          popover().findByText(column2Name).click();
          visualize();
          cy.wait("@dataset");
        }

        cy.log("temporal breakouts");
        testSortByBreakout({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });
        assertTableData({
          columns: ["Created At: Year", "Created At: Month", "Count"],
          firstRows: [
            ["2026", "January 2026", "580"],
            ["2026", "February 2026", "543"],
          ],
        });

        cy.log("'num-bins' breakouts");
        testSortByBreakout({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column2Name: "Total: 50 bins",
        });
        assertTableData({
          columns: ["Total", "Total", "Count"],
          firstRows: [
            ["140  –  160", "140  –  145", "306"],
            ["140  –  160", "145  –  150", "308"],
          ],
        });

        cy.log("'bin-width' breakouts");
        testSortByBreakout({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column2Name: "Latitude: 10°",
        });
        assertTableData({
          columns: ["Latitude", "Latitude", "Count"],
          firstRows: [
            ["60° N  –  80° N", "60° N  –  70° N", "51"],
            ["60° N  –  80° N", "70° N  –  80° N", "1"],
          ],
        });
      });
    });

    describe("summarize sidebar", () => {
      it("should allow to change buckets for multiple breakouts of the same column", () => {
        function testChangeBreakoutBuckets({
          questionDetails,
          columnPattern,
          bucketLabel,
          bucket1Name,
          bucket2Name,
        }: {
          questionDetails: StructuredQuestionDetails;
          columnPattern: RegExp;
          bucketLabel: string;
          bucket1Name: string;
          bucket2Name: string;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          summarize();
          cy.findByTestId("pinned-dimensions")
            .findAllByLabelText(columnPattern)
            .should("have.length", 2)
            .eq(0)
            .findByLabelText(bucketLabel)
            .click();
          popover().findByText(bucket1Name).click();
          cy.wait("@dataset");
          cy.findByTestId("pinned-dimensions")
            .findAllByLabelText(columnPattern)
            .should("have.length", 2)
            .eq(1)
            .findByLabelText(bucketLabel)
            .click();
          popover().findByText(bucket2Name).click();
          cy.wait("@dataset");
        }

        cy.log("temporal breakouts");
        testChangeBreakoutBuckets({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          columnPattern: /Created At/,
          bucketLabel: "Temporal bucket",
          bucket1Name: "Quarter",
          bucket2Name: "Week",
        });
        assertTableData({
          columns: ["Created At: Quarter", "Created At: Week", "Count"],
          firstRows: [["Q2 2022", "April 24, 2022 – April 30, 2022", "1"]],
        });

        cy.log("'num-bin' breakouts");
        testChangeBreakoutBuckets({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          columnPattern: /Total/,
          bucketLabel: "Binning strategy",
          bucket1Name: "10 bins",
          bucket2Name: "50 bins",
        });
        assertTableData({
          columns: ["Total", "Total", "Count"],
          firstRows: [["-60  –  -40", "-50  –  -45", "1"]],
        });

        cy.log("'bin-width' breakouts");
        testChangeBreakoutBuckets({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          columnPattern: /Latitude/,
          bucketLabel: "Binning strategy",
          bucket1Name: "Bin every 1 degree",
          bucket2Name: "Bin every 0.1 degrees",
        });
        assertTableData({
          columns: ["Latitude", "Latitude", "Count"],
          firstRows: [["25° N  –  26° N", "25.7° N  –  25.8° N", "1"]],
        });
      });
    });

    describe("timeseries chrome", () => {
      it("should use the first breakout for the chrome in case there are multiple for this column", () => {
        createQuestion(questionWith2TemporalBreakoutsDetails, {
          visitQuestion: true,
        });

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
        function testColumnSettings({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });

          cy.log("first breakout");
          tableHeaderClick(column1Name, { columnIndex: 0 });
          popover().icon("gear").click();
          popover().findByDisplayValue(column1Name).clear().type("Breakout1");
          cy.get("body").click();

          cy.log("second breakout");
          tableHeaderClick(column2Name);
          popover().icon("gear").click();
          popover().findByDisplayValue(column2Name).clear().type("Breakout2");
          cy.get("body").click();
          assertTableData({ columns: ["Breakout1", "Breakout2", "Count"] });
        }

        cy.log("temporal breakouts");
        testColumnSettings({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });

        cy.log("'num-bins' breakouts");
        testColumnSettings({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total",
          column2Name: "Total",
        });

        cy.log("'bin-width' breakouts");
        testColumnSettings({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          column1Name: "Latitude",
          column2Name: "Latitude",
        });
      });

      it("should be able to change pivot split settings when there are more than 2 breakouts", () => {
        function testPivotSplit({
          questionDetails,
          columnNamePattern,
        }: {
          questionDetails: StructuredQuestionDetails;
          columnNamePattern: RegExp;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });

          cy.log("change display and assert the default settings");
          cy.findByTestId("viz-type-button").click();
          cy.findByTestId("chart-type-sidebar")
            .findByTestId("Pivot Table-button")
            .click();
          cy.wait("@pivotDataset");
          cy.findByTestId("pivot-table")
            .findAllByText(columnNamePattern)
            .should("have.length", 3);

          cy.log("move a column from rows to columns");
          cy.findByTestId("viz-settings-button").click();
          dragField(2, 3);
          cy.wait("@pivotDataset");
          cy.findByTestId("pivot-table")
            .findAllByText(columnNamePattern)
            .should("have.length", 2);

          cy.log("move a column from columns to rows");
          dragField(4, 1);
          cy.wait("@pivotDataset");
          cy.findByTestId("pivot-table")
            .findAllByText(columnNamePattern)
            .should("have.length", 3);
        }

        cy.log("temporal breakouts");
        testPivotSplit({
          questionDetails: questionWith5TemporalBreakoutsDetails,
          columnNamePattern: /^Created At/,
        });

        cy.log("'num-bins' breakouts");
        testPivotSplit({
          questionDetails: questionWith5NumBinsBreakoutsDetails,
          columnNamePattern: /^Total$/,
        });
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

      it("should be able to use temporal-unit parameters with multiple temporal breakouts of a column", () => {
        cy.log("create dashboard");
        cy.signInAsAdmin();
        createQuestionAndDashboard({
          dashboardDetails,
          questionDetails: questionWith2TemporalBreakoutsDetails,
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
      it("should be able to add post-aggregation expressions for each breakout column", () => {
        function testDatePostAggregationExpression({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          openNotebook();

          cy.log("add a post-aggregation expression for the first column");
          getNotebookStep("summarize").button("Custom column").click();
          enterCustomColumnDetails({
            formula: `min(${column1Name})`,
            name: "Min",
            blur: true,
          });
          popover().button("Done").click();

          cy.log("add a post-aggregation expression for the second column");
          getNotebookStep("expression", { stage: 1 }).icon("add").click();
          enterCustomColumnDetails({
            formula: `max(${column2Name})`,
            name: "Max",
            blur: true,
          });
          popover().button("Done").click();

          cy.log("assert query results");
          visualize();
          cy.wait("@dataset");
        }

        cy.log("temporal breakouts");
        testDatePostAggregationExpression({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });
        assertTableData({
          columns: ["Min", "Max"],
          firstRows: [["X", "X"]],
        });

        cy.log("'num-bins' breakouts");
        testDatePostAggregationExpression({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column2Name: "Total: 50 bins",
        });
        assertTableData({
          columns: ["Min", "Max"],
          firstRows: [["X", "X"]],
        });

        cy.log("'max-bins' breakouts");
        testDatePostAggregationExpression({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column2Name: "Latitude: 10°",
        });
        assertTableData({
          columns: ["Min", "Max"],
          firstRows: [["X", "X"]],
        });
      });

      it("should be able to add post-aggregation filters for each breakout column", () => {
        function addDateBetweenFilter({
          columnName,
          columnMinValue,
          columnMaxValue,
        }: {
          columnName: string;
          columnMinValue: string;
          columnMaxValue: string;
        }) {
          popover().within(() => {
            cy.findByText(columnName).click();
            cy.findByText("Specific dates…").click();
            cy.findByText("Between").click();
            cy.findByLabelText("Start date").clear().type(columnMinValue);
            cy.findByLabelText("End date").clear().type(columnMaxValue);
            cy.button("Add filter").click();
          });
        }

        function testDatePostAggregationFilter({
          questionDetails,
          column1Name,
          column1MinValue,
          column1MaxValue,
          column2Name,
          column2MinValue,
          column2MaxValue,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column1MinValue: string;
          column1MaxValue: string;
          column2Name: string;
          column2MinValue: string;
          column2MaxValue: string;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          openNotebook();

          cy.log("add a filter for the first column");
          getNotebookStep("summarize").button("Filter").click();
          addDateBetweenFilter({
            columnName: column1Name,
            columnMinValue: column1MinValue,
            columnMaxValue: column1MaxValue,
          });

          cy.log("add a filter for the second column");
          getNotebookStep("filter", { stage: 1 }).icon("add").click();
          addDateBetweenFilter({
            columnName: column2Name,
            columnMinValue: column2MinValue,
            columnMaxValue: column2MaxValue,
          });

          cy.log("assert query results");
          visualize();
          cy.wait("@dataset");
        }

        function addNumericBetweenFilter({
          columnName,
          columnMinValue,
          columnMaxValue,
        }: {
          columnName: string;
          columnMinValue: number;
          columnMaxValue: number;
        }) {
          popover().within(() => {
            cy.findByText(columnName).click();
            cy.findByPlaceholderText("Min")
              .clear()
              .type(String(columnMinValue));
            cy.findByPlaceholderText("Max")
              .clear()
              .type(String(columnMaxValue));
            cy.button("Add filter").click();
          });
        }

        function testNumericPostAggregationFilter({
          questionDetails,
          column1Name,
          column1MinValue,
          column1MaxValue,
          column2Name,
          column2MinValue,
          column2MaxValue,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column1MinValue: number;
          column1MaxValue: number;
          column2Name: string;
          column2MinValue: number;
          column2MaxValue: number;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          openNotebook();

          cy.log("add a filter for the first column");
          getNotebookStep("summarize").button("Filter").click();
          addNumericBetweenFilter({
            columnName: column1Name,
            columnMinValue: column1MinValue,
            columnMaxValue: column1MaxValue,
          });

          cy.log("add a filter for the second column");
          getNotebookStep("filter", { stage: 1 }).icon("add").click();
          addNumericBetweenFilter({
            columnName: column2Name,
            columnMinValue: column2MinValue,
            columnMaxValue: column2MaxValue,
          });

          cy.log("assert query results");
          visualize();
          cy.wait("@dataset");
        }

        cy.log("temporal buckets");
        testDatePostAggregationFilter({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column1MinValue: "January 1, 2023",
          column1MaxValue: "December 31, 2023",
          column2Name: "Created At: Month",
          column2MinValue: "March 1, 2023",
          column2MaxValue: "May 31, 2023",
        });
        assertTableData({
          columns: ["Created At: Year", "Created At: Month", "Count"],
          firstRows: [
            ["2023", "March 2023", "256"],
            ["2023", "April 2023", "238"],
            ["2023", "May 2023", "271"],
          ],
        });
        assertQueryBuilderRowCount(3);

        cy.log("'num-bins' breakouts");
        testNumericPostAggregationFilter({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column1MinValue: 10,
          column1MaxValue: 50,
          column2Name: "Total: 50 bins",
          column2MinValue: 10,
          column2MaxValue: 50,
        });
        assertTableData({
          columns: ["Total", "Total", "Count"],
          firstRows: [
            ["40  –  60", "50  –  55", "1,070"],
            ["40  –  60", "55  –  60", "877"],
          ],
        });
        assertQueryBuilderRowCount(2);

        cy.log("'bin-width' breakouts");
        testNumericPostAggregationFilter({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column1MinValue: 10,
          column1MaxValue: 50,
          column2Name: "Total: 50 bins",
          column2MinValue: 10,
          column2MaxValue: 50,
        });
        assertTableData({
          columns: ["Total", "Total", "Count"],
          firstRows: [
            ["40  –  60", "50  –  55", "1,070"],
            ["40  –  60", "55  –  60", "877"],
          ],
        });
        assertQueryBuilderRowCount(2);
      });

      it("should be able to add post-aggregation aggregations for each breakout column", () => {
        function testPostAggregationAggregation({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          openNotebook();

          cy.log("add an aggregation for the first column");
          getNotebookStep("summarize").button("Summarize").click();
          popover().within(() => {
            cy.findByText("Minimum of ...").click();
            cy.findByText(column1Name).click();
          });

          cy.log("add an aggregation for the second column");
          getNotebookStep("summarize", { stage: 1 }).icon("add").click();
          popover().within(() => {
            cy.findByText("Maximum of ...").click();
            cy.findByText(column2Name).click();
          });

          cy.log("assert query results");
          visualize();
          cy.wait("@dataset");
        }

        cy.log("temporal breakouts");
        testPostAggregationAggregation({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });
        assertTableData({
          columns: ["Min of Created At: Month", "Max of Created At: Year"],
          firstRows: [["April 1, 2022, 12:00 AM", "January 1, 2026, 12:00 AM"]],
        });

        cy.log("'num-bins' breakouts");
        testPostAggregationAggregation({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column2Name: "Total: 50 bins",
        });
        assertTableData({
          columns: ["Min of Total", "Max of Total"],
          firstRows: [["X", "X"]],
        });

        cy.log("'max-bins' breakouts");
        testPostAggregationAggregation({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column2Name: "Latitude: 10°",
        });
        assertTableData({
          columns: ["Min of Latitude", "Max of Latitude"],
          firstRows: [["X", "X"]],
        });
      });

      it("should be able to add post-aggregation breakouts for each breakout column", () => {
        function testPostAggregationBreakout({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          openNotebook();

          cy.log("add an aggregation");
          getNotebookStep("summarize").button("Summarize");
          popover().findByText("Count of rows").click();

          cy.log("add a breakout for the first breakout column");
          getNotebookStep("summarize", { stage: 1 })
            .findByTestId("breakout-step")
            .findByText("Pick a column to group by")
            .click();
          popover().findByText(column1Name).click();

          cy.log("add a breakout for the second breakout column");
          getNotebookStep("summarize", { stage: 1 })
            .findByTestId("breakout-step")
            .icon("add")
            .click();
          popover().findByText(column2Name).click();

          cy.log("assert query results");
          visualize();
          cy.wait("@dataset");
        }

        cy.log("temporal breakouts");
        testPostAggregationBreakout({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });
        assertTableData({
          columns: ["X", "X"],
          firstRows: [["X", "X"]],
        });

        cy.log("'num-bins' breakouts");
        testPostAggregationBreakout({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column2Name: "Total: 50 bins",
        });
        assertTableData({
          columns: ["X", "X"],
          firstRows: [["X", "X"]],
        });

        cy.log("'max-bins' breakouts");
        testPostAggregationBreakout({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column2Name: "Latitude: 10°",
        });
        assertTableData({
          columns: ["X", "X"],
          firstRows: [["X", "X"]],
        });
      });
    });

    describe("filter modal", () => {
      it("should be able to add post-aggregation filters for each breakout in the filter modal", () => {
        function addDateBetweenFilter({
          columnName,
          columnMinValue,
          columnMaxValue,
        }: {
          columnName: string;
          columnMinValue: string;
          columnMaxValue: string;
        }) {
          modal()
            .findByTestId(`filter-column-${columnName}`)
            .findByLabelText("More options")
            .click();
          popover().within(() => {
            cy.findByText("Specific dates…").click();
            cy.findByText("Between").click();
            cy.findByLabelText("Start date").clear().type(columnMinValue);
            cy.findByLabelText("End date").clear().type(columnMaxValue);
            cy.button("Add filter").click();
          });
        }

        function testDatePostAggregationFilter({
          questionDetails,
          column1Name,
          column1MinValue,
          column1MaxValue,
          column2Name,
          column2MinValue,
          column2MaxValue,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column1MinValue: string;
          column1MaxValue: string;
          column2Name: string;
          column2MinValue: string;
          column2MaxValue: string;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          filter();

          cy.log("add a filter for the first column");
          addDateBetweenFilter({
            columnName: column1Name,
            columnMinValue: column1MinValue,
            columnMaxValue: column1MaxValue,
          });

          cy.log("add a filter for the second column");
          addDateBetweenFilter({
            columnName: column2Name,
            columnMinValue: column2MinValue,
            columnMaxValue: column2MaxValue,
          });

          cy.log("assert query results");
          visualize();
          cy.wait("@dataset");
        }

        function addNumericBetweenFilter({
          columnName,
          columnMinValue,
          columnMaxValue,
        }: {
          columnName: string;
          columnMinValue: number;
          columnMaxValue: number;
        }) {
          modal()
            .findByTestId(`filter-column-${columnName}`)
            .findByPlaceholderText("Min")
            .clear()
            .type(String(columnMinValue));
          modal()
            .findByTestId(`filter-column-${columnName}`)
            .findByPlaceholderText("Max")
            .clear()
            .type(String(columnMaxValue));
        }

        function testNumericPostAggregationFilter({
          questionDetails,
          column1Name,
          column1MinValue,
          column1MaxValue,
          column2Name,
          column2MinValue,
          column2MaxValue,
        }: {
          questionDetails: StructuredQuestionDetails;
          column1Name: string;
          column1MinValue: number;
          column1MaxValue: number;
          column2Name: string;
          column2MinValue: number;
          column2MaxValue: number;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          filter();

          cy.log("add a filter for the first column");
          addNumericBetweenFilter({
            columnName: column1Name,
            columnMinValue: column1MinValue,
            columnMaxValue: column1MaxValue,
          });

          cy.log("add a filter for the second column");
          addNumericBetweenFilter({
            columnName: column2Name,
            columnMinValue: column2MinValue,
            columnMaxValue: column2MaxValue,
          });

          cy.log("assert query results");
          visualize();
          cy.wait("@dataset");
        }

        cy.log("temporal buckets");
        testDatePostAggregationFilter({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column1MinValue: "January 1, 2023",
          column1MaxValue: "December 31, 2023",
          column2Name: "Created At: Month",
          column2MinValue: "March 1, 2023",
          column2MaxValue: "May 31, 2023",
        });
        assertTableData({
          columns: ["Created At: Year", "Created At: Month", "Count"],
          firstRows: [
            ["2023", "March 2023", "256"],
            ["2023", "April 2023", "238"],
            ["2023", "May 2023", "271"],
          ],
        });
        assertQueryBuilderRowCount(3);

        cy.log("'num-bins' breakouts");
        testNumericPostAggregationFilter({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column1MinValue: 10,
          column1MaxValue: 50,
          column2Name: "Total: 50 bins",
          column2MinValue: 10,
          column2MaxValue: 50,
        });
        assertTableData({
          columns: ["Total", "Total", "Count"],
          firstRows: [
            ["40  –  60", "50  –  55", "1,070"],
            ["40  –  60", "55  –  60", "877"],
          ],
        });
        assertQueryBuilderRowCount(2);

        cy.log("'bin-width' breakouts");
        testNumericPostAggregationFilter({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column1MinValue: 10,
          column1MaxValue: 50,
          column2Name: "Total: 50 bins",
          column2MinValue: 10,
          column2MaxValue: 50,
        });
        assertTableData({
          columns: ["Total", "Total", "Count"],
          firstRows: [
            ["40  –  60", "50  –  55", "1,070"],
            ["40  –  60", "55  –  60", "877"],
          ],
        });
        assertQueryBuilderRowCount(2);
      });
    });

    describe("viz settings", () => {
      it("should be able to toggle the fields that correspond to breakout columns in the previous stage", () => {
        function toggleColumn(columnName: string, isVisible: boolean) {
          cy.findByTestId("visible-columns")
            .findByTestId(`${columnName}-column`)
            .should(isVisible ? "not.be.checked" : "be.checked")
            .click();
          cy.findByTestId("visible-columns")
            .findByTestId(`${columnName}-column`)
            .should(isVisible ? "be.checked" : "not.be.checked");
        }

        function testVisibleFields({
          questionDetails,
          queryColumn1Name,
          queryColumn2Name,
          tableColumn1Name,
          tableColumn2Name,
        }: {
          questionDetails: StructuredQuestionDetails;
          queryColumn1Name: string;
          queryColumn2Name: string;
          tableColumn1Name: string;
          tableColumn2Name: string;
        }) {
          createQuestion(questionDetails, { visitQuestion: true });
          assertTableData({
            columns: ["Count", tableColumn1Name, tableColumn2Name],
          });

          cy.findByTestId("viz-settings-button").click();
          toggleColumn(queryColumn1Name, false);
          cy.wait("@dataset");
          assertTableData({ columns: ["Count", tableColumn2Name] });

          toggleColumn(queryColumn2Name, false);
          cy.wait("@dataset");
          assertTableData({ columns: ["Count"] });

          toggleColumn(queryColumn1Name, true);
          cy.wait("@dataset");
          assertTableData({ columns: ["Count", tableColumn1Name] });

          toggleColumn(queryColumn2Name, true);
          assertTableData({
            columns: ["Count", tableColumn1Name, tableColumn2Name],
          });
        }

        cy.log("temporal breakouts");
        testVisibleFields({
          questionDetails: multiStageQuestionWith2TemporalBreakoutsDetails,
          queryColumn1Name: "Created At: Year",
          queryColumn2Name: "Created At: Month",
          tableColumn1Name: "Created At: Year",
          tableColumn2Name: "Created At: Month",
        });

        cy.log("'num-bins' breakouts");
        testVisibleFields({
          questionDetails: multiStageQuestionWith2NumBinsBreakoutsDetails,
          queryColumn1Name: "Total: 10 bins",
          queryColumn2Name: "Total: 50 bins",
          tableColumn1Name: "Total",
          tableColumn2Name: "Total",
        });

        cy.log("'bin-width' breakouts");
        testVisibleFields({
          questionDetails: multiStageQuestionWith2BinWidthBreakoutsDetails,
          queryColumn1Name: "Latitude: 20°",
          queryColumn2Name: "Latitude: 10°",
          tableColumn1Name: "Latitude",
          tableColumn2Name: "Latitude",
        });
      });
    });
  });
});

function tableHeaderClick(
  columnName: string,
  { columnIndex = 0 }: { columnIndex?: number } = {},
) {
  tableInteractive()
    .findAllByText(columnName)
    .eq(columnIndex)
    .trigger("mousedown");

  tableInteractive()
    .findAllByText(columnName)
    .eq(columnIndex)
    .trigger("mouseup");
}

function assertTableData({
  columns = [],
  firstRows = [],
}: {
  columns: string[];
  firstRows?: string[][];
}) {
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
