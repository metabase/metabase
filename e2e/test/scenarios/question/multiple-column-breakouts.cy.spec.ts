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
  tableInteractive,
  tableInteractiveBody,
  visitDashboard,
  visitEmbeddedPage,
  visitPublicDashboard,
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
      function testNewQueryWithBreakouts({
        tableName,
        columnName,
        bucketLabel,
        bucket1Name,
        bucket2Name,
        expectedRowCount,
      }: {
        tableName: string;
        columnName: string;
        bucketLabel: string;
        bucket1Name: string;
        bucket2Name: string;
        expectedRowCount: number;
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
        cy.button("Visualize").click();
        cy.wait("@dataset");
        assertQueryBuilderRowCount(expectedRowCount);
      }

      it("should allow to create a query with multiple breakouts with temporal buckets", () => {
        testNewQueryWithBreakouts({
          tableName: "Orders",
          columnName: "Created At",
          bucketLabel: "Temporal bucket",
          bucket1Name: "Year",
          bucket2Name: "Month",
          expectedRowCount: 49,
        });
      });

      it("should allow to create a query with multiple breakouts with the 'num-bins' binning strategy", () => {
        testNewQueryWithBreakouts({
          tableName: "Orders",
          columnName: "Total",
          bucketLabel: "Binning strategy",
          bucket1Name: "10 bins",
          bucket2Name: "50 bins",
          expectedRowCount: 32,
        });
      });

      it("should allow to create a query with multiple breakouts with the 'bin-width' binning strategy", () => {
        testNewQueryWithBreakouts({
          tableName: "People",
          columnName: "Latitude",
          bucketLabel: "Binning strategy",
          bucket1Name: "Bin every 10 degrees",
          bucket2Name: "Bin every 20 degrees",
          expectedRowCount: 6,
        });
      });

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
        cy.button("Visualize").click();
        cy.wait("@dataset");
      }

      it("should allow to sort by breakout columns with temporal buckets", () => {
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
      });

      it("should allow to sort by breakout columns with the 'num-bins' binning strategy", () => {
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
      });

      it("should allow to sort by breakout columns with the 'bin-width' binning strategy", () => {
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

      it("should allow to change temporal buckets for multiple breakouts of the same column", () => {
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
      });

      it("should allow to change 'num-bins' binning strategies for multiple breakouts of the same column", () => {
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
      });

      it("should allow to change 'bin-width' binning strategies for multiple breakouts of the same column", () => {
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

      it("should be able to change formatting settings for temporal breakouts of the same column", () => {
        testColumnSettings({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });
      });

      it("should be able to change formatting settings for 'num-bins' breakouts of the same column", () => {
        testColumnSettings({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total",
          column2Name: "Total",
        });
      });

      it("should be able to change formatting settings for 'bin-width' breakouts of the same column", () => {
        testColumnSettings({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          column1Name: "Latitude",
          column2Name: "Latitude",
        });
      });

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

      it("should be able to change pivot split settings when there are more than 2 temporal breakouts", () => {
        testPivotSplit({
          questionDetails: questionWith5TemporalBreakoutsDetails,
          columnNamePattern: /^Created At/,
        });
      });

      it("should be able to change pivot split settings when there are more than 2 'num-bins' breakouts", () => {
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
      it("should be able to add post-aggregation filters for each breakout column", () => {
        createQuestion(questionWith2TemporalBreakoutsDetails, {
          visitQuestion: true,
        });
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
        cy.button("Visualize").click();
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

      it("should be able to add post-aggregation aggregations for each breakout column", () => {
        createQuestion(questionWith2TemporalBreakoutsDetails, {
          visitQuestion: true,
        });
        openNotebook();

        cy.log("add an aggregation for the year column");
        getNotebookStep("summarize").button("Summarize").click();
        popover().within(() => {
          cy.findByText("Maximum of ...").click();
          cy.findByText("Created At: Year").click();
        });

        cy.log("add an aggregation for the month column");
        getNotebookStep("summarize", { stage: 1 }).icon("add").click();
        popover().within(() => {
          cy.findByText("Minimum of ...").click();
          cy.findByText("Created At: Month").click();
        });

        cy.log("assert query results");
        cy.button("Visualize").click();
        cy.wait("@dataset");
        assertTableData({
          columns: ["Max of Created At: Year", "Min of Created At: Month"],
          firstRows: [["January 1, 2026, 12:00 AM", "April 1, 2022, 12:00 AM"]],
        });
        assertQueryBuilderRowCount(1);
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
