import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  POPOVER_ELEMENT,
  type StructuredQuestionDetails,
  addSummaryField,
  addSummaryGroupingField,
  createQuestion,
  createSegment,
  echartsContainer,
  enterCustomColumnDetails,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  modal,
  openNotebook,
  openTable,
  popover,
  restore,
  startNewQuestion,
  startSort,
  summarize,
  visitMetric,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";
import { uuid } from "metabase/lib/uuid";
import type {
  Aggregation,
  Breakout,
  FieldReference,
  StructuredQuery,
} from "metabase-types/api";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_ID_FIELD_REF: FieldReference = [
  "field",
  ORDERS.ID,
  { "base-type": "type/BigInteger" },
];

const ORDERS_TOTAL_FIELD_REF: FieldReference = [
  "field",
  ORDERS.TOTAL,
  { "base-type": "type/Float" },
];

const ORDERS_CREATED_AT_BREAKOUT: Breakout = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

const PRODUCTS_CATEGORY_BREAKOUT: Breakout = [
  "field",
  PRODUCTS.CATEGORY,
  { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
];

const SUM_TOTAL_AGGREGATION: Aggregation = ["sum", ORDERS_TOTAL_FIELD_REF];

const OFFSET_SUM_TOTAL_AGGREGATION_NAME = "Offsetted sum of total";

const OFFSET_SUM_TOTAL_AGGREGATION: Aggregation = [
  "offset",
  createOffsetOptions(OFFSET_SUM_TOTAL_AGGREGATION_NAME),
  SUM_TOTAL_AGGREGATION,
  -1,
];

describe("scenarios > question > offset", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  describe("custom columns", () => {
    // This test contradicts the next 2 skipped ones.
    // Remove it once we enable offset() in custom columns.
    it("does not suggest or allow using offset()", () => {
      const expression = "Offset([Total], -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        fields: [ORDERS_ID_FIELD_REF, ORDERS_TOTAL_FIELD_REF],
        limit: 5,
        "order-by": [["asc", ORDERS_TOTAL_FIELD_REF]],
      };

      createQuestion({ query }, { visitQuestion: true });
      openNotebook();
      cy.button("Custom column").click();
      enterCustomColumnDetails({ formula: prefix });

      cy.log("does not suggest offset() in custom columns");
      cy.findByTestId("expression-suggestions-list-item").should("not.exist");

      enterCustomColumnDetails({ formula: expression });
      cy.realPress("Tab");

      popover().within(() => {
        cy.button("Done").should("be.disabled");
        cy.findByText("OFFSET is not supported in custom columns").should(
          "exist",
        );
      });
    });

    // Skipped because we want to disable offset() in custom columns for now
    it.skip("suggests and allows using offset()", () => {
      const expression = "Offset([Total], -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        fields: [ORDERS_ID_FIELD_REF, ORDERS_TOTAL_FIELD_REF],
        limit: 5,
      };

      createQuestion({ query }, { visitQuestion: true });
      openNotebook();
      cy.button("Custom column").click();
      enterCustomColumnDetails({ formula: prefix });

      cy.log("suggests offset() in custom column expressions");
      cy.findByTestId("expression-suggestions-list-item")
        .should("exist")
        .and("have.text", "Offset");

      enterCustomColumnDetails({ formula: expression });
      cy.realPress("Tab");

      popover().within(() => {
        cy.findByText("OFFSET in a custom expression requires a sort order");
        cy.button("Done").should("be.disabled");
        cy.button("Cancel").click();
      });

      cy.button("Sort").click();
      popover().findByText("ID").click();
      getNotebookStep("expression").icon("add").click();
      enterCustomColumnDetails({ formula: expression });
      cy.realPress("Tab");

      popover().within(() => {
        cy.button("Done").should("be.disabled");

        cy.findByPlaceholderText("Something nice and descriptive")
          .type("My expression")
          .blur();

        cy.button("Done").should("be.enabled").click();
      });

      cy.log("preview availability");
      getNotebookStep("data").icon("play").should("be.visible");
      getNotebookStep("expression").icon("play").should("not.be.visible");
      getNotebookStep("sort").icon("play").should("be.visible");
      getNotebookStep("limit").icon("play").should("be.visible");

      visualize();
      verifyTableContent([
        ["1", "39.72", ""],
        ["2", "117.03", "39.72"],
        ["3", "49.21", "117.03"],
      ]);
    });

    // Skipped because we want to disable offset() in custom columns for now
    it.skip("does not allow to use offset-based column in other clauses (metabase#42764)", () => {
      const offsettedColumnName = "xyz";
      const expression = `Offset([${offsettedColumnName}], -1)`;
      const prefixLength = "Offset([x".length;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        expressions: {
          [offsettedColumnName]: [
            "offset",
            createOffsetOptions(offsettedColumnName),
            ORDERS_TOTAL_FIELD_REF,
            -1,
          ],
        },
        "order-by": [["asc", ORDERS_ID_FIELD_REF]],
        limit: 5,
      };

      createQuestion({ query }, { visitQuestion: true });

      cy.log("custom column drills");
      const rowIndex = 1;
      const columnIndex = 9;
      const columnsCount = 10;
      const cellIndex = rowIndex * columnsCount + columnIndex;
      cy.findAllByRole("gridcell").eq(cellIndex).click();
      cy.get(POPOVER_ELEMENT).should("not.exist");

      openNotebook();

      cy.log("custom column expressions");
      getNotebookStep("expression").icon("add").click();
      verifyInvalidColumnName(offsettedColumnName, prefix, expression);
      popover().button("Cancel").click();

      cy.log("custom filter expressions");
      cy.icon("filter").click();
      popover().findByText("Custom Expression").click();
      verifyInvalidColumnName(offsettedColumnName, prefix, expression);
      popover().button("Cancel").click();
      cy.realPress("Escape");

      cy.log("custom aggregation expressions");
      cy.icon("sum").click();
      popover().findByText("Custom Expression").click();
      verifyInvalidColumnName(offsettedColumnName, prefix, expression);
      popover().button("Cancel").click();
      cy.realPress("Escape");

      cy.log("sort clause");
      getNotebookStep("sort").icon("add").click();
      popover().should("not.contain", offsettedColumnName);
    });
  });

  describe("filters", () => {
    it("does not suggest or allow using offset()", () => {
      const expression = "Offset([Total], -1) > 0";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        limit: 5,
      };

      createQuestion({ query }, { visitQuestion: true });
      openNotebook();
      cy.button("Filter").click();
      popover().findByText("Custom Expression").click();
      enterCustomColumnDetails({ formula: prefix });

      cy.log("does not suggest offset() in filter expressions");
      cy.findByTestId("expression-suggestions-list-item").should("not.exist");

      enterCustomColumnDetails({ formula: expression });
      cy.realPress("Tab");

      popover().within(() => {
        cy.button("Done").should("be.disabled");
        cy.findByText("OFFSET is not supported in custom filters").should(
          "exist",
        );
      });
    });
  });

  describe("aggregations", () => {
    it("suggests and allows using offset()", () => {
      const expression = "Offset(Sum([Total]), -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        limit: 5,
      };

      createQuestion({ query }, { visitQuestion: true });
      openNotebook();
      cy.button("Summarize").click();
      getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      popover().findByText("Custom Expression").click();
      enterCustomColumnDetails({ formula: prefix, blur: false });

      cy.log("suggests offset() in aggregation expressions");
      cy.findByTestId("expression-suggestions-list-item")
        .should("exist")
        .and("have.text", "Offset");

      enterCustomColumnDetails({ formula: expression, blur: false });
      cy.realPress("Tab");

      popover().within(() => {
        cy.button("Done").should("be.disabled");

        cy.findByPlaceholderText("Something nice and descriptive")
          .type("My expression")
          .blur();

        cy.button("Done").should("be.enabled");
      });
    });

    it("does not work without a breakout", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
      };

      createQuestion({ query }, { visitQuestion: true });

      verifyQuestionError(
        "Window function requires either breakouts or order by in the query",
      );
    });

    it.skip("does not preview sql without a breakout (metabase#47819)", () => {
      cy.intercept("POST", "/api/dataset/native").as("sqlPreview");

      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
        limit: 5,
      };

      createQuestion({ query }, { visitQuestion: true });

      openNotebook();

      cy.findByLabelText("View the SQL").click();
      cy.wait("@sqlPreview");

      cy.findByTestId("native-query-preview-sidebar").should(
        "not.contain",
        "Error generating the query.",
      );
    });

    it("works with a single breakout", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
        breakout: [ORDERS_CREATED_AT_BREAKOUT],
        limit: 5,
      };

      createQuestion({ query }, { visitQuestion: true });

      verifyNoQuestionError();
      verifyTableContent([
        ["April 2022", ""],
        ["May 2022", "52.76"],
      ]);

      openNotebook();
      getNotebookStep("summarize").icon("play").should("be.visible");
    });

    it("works with a single breakout and sorting by breakout", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
        breakout: [ORDERS_CREATED_AT_BREAKOUT],
        limit: 5,
        "order-by": [["desc", ORDERS_CREATED_AT_BREAKOUT]],
      };

      createQuestion({ query }, { visitQuestion: true });

      verifyNoQuestionError();
      verifyTableContent([
        ["April 2026", ""],
        ["March 2026", "30,759.47"],
      ]);
    });

    it("works with a single breakout and sorting by aggregation (metabase#42554)", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
        breakout: [ORDERS_CREATED_AT_BREAKOUT],
        limit: 5,
        "order-by": [["desc", ["aggregation", 0]]],
      };

      createQuestion({ query }, { visitQuestion: true });

      verifyNoQuestionError();
      verifyTableContent([
        [
          "February 2026",
          "52,249.59",
          "February 2025",
          "51,634.16",
          "April 2025",
          "51,347.1",
          "September 2025",
          "50,597.16",
          "January 2026",
          "48,260.76",
        ],
      ]);
    });

    it("works with multiple breakouts", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
        breakout: [ORDERS_CREATED_AT_BREAKOUT, PRODUCTS_CATEGORY_BREAKOUT],
      };

      createQuestion({ query }, { visitQuestion: true });

      verifyNoQuestionError();
      verifyTableContent([
        ["April 2022", "", "", "", ""],
        ["May 2022", "", "52.76", "", ""],
        ["June 2022", "339.14", "203.57", "493.51", "229.5"],
      ]);
    });

    it("works with multiple aggregations and breakouts", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        aggregation: [SUM_TOTAL_AGGREGATION, OFFSET_SUM_TOTAL_AGGREGATION],
        breakout: [ORDERS_CREATED_AT_BREAKOUT, PRODUCTS_CATEGORY_BREAKOUT],
        limit: 9,
      };

      createQuestion({ query }, { visitQuestion: true });

      verifyNoQuestionError();
      verifyTableContent([
        ["May 2022", "Doohickey", "339.14", ""],
        ["June 2022", "Doohickey", "482.56", "339.14"],
        ["July 2022", "Doohickey", "1,160.83", "482.56"],
        ["August 2022", "Doohickey", "751.29", "1,160.83"],
        ["September 2022", "Doohickey", "802.49", "751.29"],
        ["October 2022", "Doohickey", "1,553.37", "802.49"],
        ["November 2022", "Doohickey", "1,728.4", "1,553.37"],
        ["December 2022", "Doohickey", "2,213.47", "1,728.4"],
        ["January 2023", "Doohickey", "1,939.99", "2,213.47"],
      ]);
    });

    it("works after saving a question (metabase#42323)", () => {
      const breakoutName = "Created At";

      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      addCustomAggregation({
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        isFirst: true,
      });
      addBreakout(breakoutName);

      visualize();
      verifyNoQuestionError();
      verifyLineChart({
        xAxis: breakoutName + ": Month",
        yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });

      saveQuestion().then(({ response }) => {
        visitQuestion(response?.body.id);
        verifyNoQuestionError();
        verifyLineChart({
          xAxis: breakoutName + ": Month",
          yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });
      });
    });

    it("works in a complex real-life scenario", () => {
      const breakoutName = "Created At";
      const totalSalesName = "Total sales (this month)";
      const totalSalesLastMonthName = "Total sales (last month)";
      const percentSalesGrowthName = "Percent sales growth over last month";
      const rollingTotalName = "Rolling total of sales last 3 months";
      const rollingAverageName = "Rolling average of sales last 3 months";
      const legendItems = [
        totalSalesName,
        totalSalesLastMonthName,
        percentSalesGrowthName,
        rollingTotalName,
        rollingAverageName,
      ];

      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      addCustomAggregation({
        formula: "Sum([Total])",
        name: totalSalesName,
        isFirst: true,
      });
      addCustomAggregation({
        formula: "Offset(Sum([Total]), -1)",
        name: totalSalesLastMonthName,
      });
      addCustomAggregation({
        formula: "Sum([Total]) / Offset(Sum([Total]), -1) - 1",
        name: percentSalesGrowthName,
      });
      addCustomAggregation({
        formula:
          "Sum([Total]) + Offset(Sum([Total]), -1) + Offset(Sum([Total]), -2)",
        name: rollingTotalName,
      });
      addCustomAggregation({
        formula:
          "(Sum([Total]) + Offset(Sum([Total]), -1) + Offset(Sum([Total]), -2)) / 3",
        name: rollingAverageName,
      });
      addBreakout(breakoutName);

      visualize();
      verifyNoQuestionError();
      verifyLineChart({
        xAxis: breakoutName + ": Month",
        legendItems,
      });

      // checking data after saveQuestion is not necessary as it's covered by "works after saving a question (metabase#42323)"
      saveQuestion().then(({ response }) => {
        visitQuestion(response?.body.id);
        verifyNoQuestionError();
        verifyLineChart({
          xAxis: breakoutName + ": Month",
          legendItems,
        });
      });
    });

    it("should allow using OFFSET as a CASE argument (metabase#42377)", () => {
      const formula = "Sum(case([Total] > 0, Offset([Total], -1)))";
      const name = "Aggregation";
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
      };

      createQuestion({ query }, { visitQuestion: true });
      openNotebook();
      cy.button("Summarize").click();
      addCustomAggregation({ formula, name, isFirst: true });

      cy.findAllByTestId("notebook-cell-item").findByText(name).click();
      cy.findByTestId("expression-editor-textfield").should("contain", formula);

      cy.on("uncaught:exception", error => {
        // this check is intended to catch possible normalization errors if BE or FE code changes
        // does not run by default
        expect(error.message.includes("Error normalizing")).to.be.false;
      });
    });

    it("should create filter and CC with offset aggregation and sort correctly", () => {
      openTable({ table: ORDERS_ID });

      openNotebook();

      summarize({ mode: "notebook" });
      addCustomAggregation({
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        isOpened: true,
      });

      addSummaryGroupingField({ field: "Created At" });
      addSummaryGroupingField({
        table: "Product",
        field: "Category",
      });
      cy.findAllByLabelText("Custom column").last().click();

      enterCustomColumnDetails({
        formula: `[${OFFSET_SUM_TOTAL_AGGREGATION_NAME}] * 2`,
        name: `${OFFSET_SUM_TOTAL_AGGREGATION_NAME} * 2`,
      });
      popover().findByText("Done").click();

      cy.findAllByTestId("action-buttons").last().icon("filter").click();
      popover().findByText("Custom Expression").click();

      enterCustomColumnDetails({
        formula: `[${OFFSET_SUM_TOTAL_AGGREGATION_NAME}] > 1000`,
      });
      popover().findByText("Done").click();

      cy.findAllByTestId("action-buttons").last().icon("sort").click();
      popover().findByText(OFFSET_SUM_TOTAL_AGGREGATION_NAME).click();
      getNotebookStep("sort", { stage: 1, index: 0 })
        .findByText(OFFSET_SUM_TOTAL_AGGREGATION_NAME)
        .click();

      visualize();

      verifyNoQuestionError();
      verifyTableContent([
        ["April 2025", "Gadget", "15,713", "31,426.01"],
        ["September 2025", "Gadget", "15,017.31", "30,034.62"],
      ]);
    });
  });

  describe("explicit joins", () => {
    it("offset expression not in the first place in aggregation", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
            ],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
      };

      createQuestion({ query }, { visitQuestion: true });
      openNotebook();

      summarize({ mode: "notebook" });
      addSummaryField({ metric: "Sum of ...", field: "Total" });
      addCustomAggregation({
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });

      addSummaryGroupingField({
        table: "Products",
        field: "Category",
      });

      addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });

      addSorting({ field: "Created At" });
      visualize();

      verifyNoQuestionError();
      verifyTableContent([
        ["Doohickey", "2022", "9,031.56", ""],
        ["Gadget", "2022", "10,672.63", ""],
        ["Gizmo", "2022", "9,929.32", ""],
        ["Widget", "2022", "12,523.37", ""],
        ["Doohickey", "2023", "43,069.14", "9,031.56"],
        ["Gadget", "2023", "54,960.62", "10,672.63"],
        ["Gizmo", "2023", "48,130.71", "9,929.32"],
        ["Widget", "2023", "59,095.56", "12,523.37"],
      ]);

      openNotebook();
      getNotebookStep("summarize").icon("play").should("be.visible");
    });

    it("offset expression is in the first place in aggregation", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
            ],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
      };

      createQuestion({ query }, { visitQuestion: true });
      openNotebook();

      summarize({ mode: "notebook" });
      addCustomAggregation({
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        isOpened: true,
      });
      addSummaryField({ metric: "Sum of ...", field: "Total" });

      addSummaryGroupingField({
        table: "Products",
        field: "Category",
      });

      addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });

      startSort();
      popover().contains("Created At").click();

      visualize();

      verifyNoQuestionError();
      verifyTableContent([
        ["Doohickey", "2022", "", "9,031.56"],
        ["Gadget", "2022", "", "10,672.63"],
        ["Gizmo", "2022", "", "9,929.32"],
        ["Widget", "2022", "", "12,523.37"],
        ["Doohickey", "2023", "9,031.56", "43,069.14"],
        ["Gadget", "2023", "10,672.63", "54,960.62"],
        ["Gizmo", "2023", "9,929.32", "48,130.71"],
        ["Widget", "2023", "12,523.37", "59,095.56"],
      ]);

      openNotebook();
      getNotebookStep("summarize").icon("play").should("be.visible");
    });

    it("offset and avg function applied to custom column", () => {
      const customColumnName = "CC Product Rating";

      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
            ],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
      };

      createQuestion({ query }, { visitQuestion: true });

      openNotebook();
      addCustomColumn({
        name: customColumnName,
        formula: "[Products → Rating]",
      });

      summarize({ mode: "notebook" });
      addSummaryField({ metric: "Average of ...", field: customColumnName });

      addCustomAggregation({
        formula: `Offset(Average([${customColumnName}]), -1)`,
        name: "offsetted avg product rating",
      });

      addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
      addSummaryGroupingField({
        field: customColumnName,
      });

      startSort();
      popover().contains(customColumnName).click();
      getNotebookStep("sort").findByText(customColumnName).click();

      visualize();

      verifyNoQuestionError();
      verifyTableContent([
        ["2022", "5", "5", ""],
        ["2023", "5", "5", "5"],
        ["2024", "5", "5", "5"],
      ]);
    });
  });

  describe("implicit joins", () => {
    describe("when custom column is in the first place of breakout", () => {
      it("works with custom column that contains a function", () => {
        const customColumnName = "CC Product Category";
        openTable({ table: ORDERS_ID });

        openNotebook();

        summarize({ mode: "notebook" });

        addSummaryField({ metric: "Sum of ...", field: "Total" });
        addCustomAggregation({
          formula: "Offset(Sum([Total]), -1)",
          name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });

        addCustomColumn({
          formula: 'concat([Product → Category], " from products")',
          name: customColumnName,
        });

        addSummaryGroupingField({
          field: customColumnName,
        });
        addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });

        addSorting({ field: "Created At" });
        visualize();

        verifyNoQuestionError();
        verifyTableContent([
          ["Doohickey from products", "2022", "9,031.56", ""],
          ["Gadget from products", "2022", "10,672.63", ""],
          ["Gizmo from products", "2022", "9,929.32", ""],
          ["Widget from products", "2022", "12,523.37", ""],
          ["Doohickey from products", "2023", "43,069.14", "9,031.56"],
          ["Gadget from products", "2023", "54,960.62", "10,672.63"],
          ["Gizmo from products", "2023", "48,130.71", "9,929.32"],
          ["Widget from products", "2023", "59,095.56", "12,523.37"],
        ]);

        openNotebook();
        getNotebookStep("summarize").icon("play").should("be.visible");
      });

      it("works with custom column that contains a column", () => {
        const customColumnName = "CC Product Category";
        openTable({ table: ORDERS_ID });

        openNotebook();

        summarize({ mode: "notebook" });

        addSummaryField({ metric: "Sum of ...", field: "Total" });
        addCustomAggregation({
          formula: "Offset(Sum([Total]), -1)",
          name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });

        addCustomColumn({
          formula: "[Product → Category]",
          name: customColumnName,
        });

        addSummaryGroupingField({
          field: customColumnName,
        });
        addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });

        addSorting({ field: "Created At" });
        visualize();

        verifyNoQuestionError();
        verifyTableContent([
          ["Doohickey", "2022", "9,031.56", ""],
          ["Gadget", "2022", "10,672.63", ""],
          ["Gizmo", "2022", "9,929.32", ""],
          ["Widget", "2022", "12,523.37", ""],
          ["Doohickey", "2023", "43,069.14", "9,031.56"],
          ["Gadget", "2023", "54,960.62", "10,672.63"],
          ["Gizmo", "2023", "48,130.71", "9,929.32"],
          ["Widget", "2023", "59,095.56", "12,523.37"],
        ]);

        openNotebook();
        getNotebookStep("summarize").icon("play").should("be.visible");
      });

      it("works when custom column is a simple expression (metabase#47870)", () => {
        const customColumnName = "1 + 1";
        const customColumnName2 = "constant";
        const customColumnName3 = "string";

        openTable({ table: ORDERS_ID });

        openNotebook();

        addCustomColumn({
          name: customColumnName,
          formula: "1+1",
        });
        getNotebookStep("expression").icon("add").click();
        enterCustomColumnDetails({
          name: customColumnName2,
          formula: "0+1",
        });
        popover().findByText("Done").click();

        getNotebookStep("expression").icon("add").click();
        enterCustomColumnDetails({
          name: customColumnName3,
          formula: "concat('a','b')",
        });
        popover().findByText("Done").click();

        summarize({ mode: "notebook" });

        addSummaryField({ metric: "Sum of ...", field: "Total" });
        addCustomAggregation({
          formula: "Offset(Sum([Total]), -1)",
          name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });

        addSummaryGroupingField({
          field: customColumnName,
        });
        addSummaryGroupingField({
          field: customColumnName2,
        });
        addSummaryGroupingField({
          field: customColumnName3,
        });
        addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
        addSorting({ field: "Created At" });

        visualize();

        verifyNoQuestionError();

        verifyTableContent([
          ["2", "1", "ab", "2022", "42,156.87", ""],
          ["2", "1", "ab", "2023", "205,256.02", "42,156.87"],
          ["2", "1", "ab", "2024", "510,045.03", "205,256.02"],
        ]);

        openNotebook();
        getNotebookStep("summarize").icon("play").should("be.visible");
      });

      it("works when custom column is a simple expression with CC not in the first place", () => {
        const customColumnName = "1 + 1";
        const customColumnName2 = "constant";
        const customColumnName3 = "string";

        openTable({ table: ORDERS_ID });
        openNotebook();

        addCustomColumn({
          name: customColumnName,
          formula: "1+1",
        });

        getNotebookStep("expression").icon("add").click();
        enterCustomColumnDetails({
          name: customColumnName2,
          formula: "0+1",
        });
        popover().findByText("Done").click();

        getNotebookStep("expression").icon("add").click();
        enterCustomColumnDetails({
          name: customColumnName3,
          formula: "concat('a','b')",
        });
        popover().findByText("Done").click();

        summarize({ mode: "notebook" });

        addSummaryField({ metric: "Sum of ...", field: "Total" });
        addCustomAggregation({
          formula: "Offset(Sum([Total]), -1)",
          name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });

        addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
        addSummaryGroupingField({
          field: customColumnName,
        });
        addSummaryGroupingField({
          field: customColumnName2,
        });
        addSummaryGroupingField({
          field: customColumnName3,
        });
        addSorting({ field: "Created At" });

        visualize();

        verifyNoQuestionError();

        verifyTableContent([
          ["2022", "2", "1", "ab", "42,156.87", ""],
          ["2023", "2", "1", "ab", "205,256.02", "42,156.87"],
          ["2024", "2", "1", "ab", "510,045.03", "205,256.02"],
        ]);

        openNotebook();
        getNotebookStep("summarize").icon("play").should("be.visible");
      });
    });

    describe("when custom column is not in the first place of breakout", () => {
      it("works with custom column that contains a function", () => {
        const customColumnName = "CC Product Category";

        openTable({ table: ORDERS_ID });

        openNotebook();

        addCustomColumn({
          name: customColumnName,
          formula: 'concat([Product → Category], " from products")',
        });

        summarize({ mode: "notebook" });

        addSummaryField({ metric: "Sum of ...", field: "Total" });
        addCustomAggregation({
          formula: "Offset(Sum([Total]), -1)",
          name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });

        addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
        addSummaryGroupingField({
          field: customColumnName,
        });
        addSorting({ field: "Created At" });

        visualize();

        verifyNoQuestionError();
        verifyTableContent([
          ["2022", "Doohickey from products", "9,031.56", ""],
          ["2022", "Gadget from products", "10,672.63", ""],
          ["2022", "Gizmo from products", "9,929.32", ""],
        ]);

        openNotebook();
        getNotebookStep("summarize").icon("play").should("be.visible");
      });

      it("works with custom column that contains a column", () => {
        const customColumnName = "CC Product Category";
        openTable({ table: ORDERS_ID });

        openNotebook();

        addCustomColumn({
          name: customColumnName,
          formula: "[Product → Category]",
        });

        summarize({ mode: "notebook" });

        addSummaryField({ metric: "Sum of ...", field: "Total" });
        addCustomAggregation({
          formula: "Offset(Sum([Total]), -1)",
          name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });

        addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
        addSummaryGroupingField({
          field: customColumnName,
        });
        addSorting({ field: "Created At" });

        visualize();

        verifyNoQuestionError();
        verifyTableContent([
          ["2022", "Doohickey", "9,031.56", ""],
          ["2022", "Gadget", "10,672.63", ""],
          ["2022", "Gizmo", "9,929.32", ""],
        ]);

        openNotebook();
        getNotebookStep("summarize").icon("play").should("be.visible");
      });

      it("works when custom column is a simple expression", () => {
        const customColumnName = "1 + 1";

        openTable({ table: ORDERS_ID });

        openNotebook();

        addCustomColumn({
          name: customColumnName,
          formula: "1+1",
        });

        summarize({ mode: "notebook" });

        addSummaryField({ metric: "Sum of ...", field: "Total" });
        addCustomAggregation({
          formula: "Offset(Sum([Total]), -1)",
          name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });

        addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
        addSummaryGroupingField({
          field: customColumnName,
        });
        addSorting({ field: "Created At" });

        visualize();

        verifyNoQuestionError();
        verifyTableContent([
          ["2022", "2", "42,156.87", ""],
          ["2023", "2", "205,256.02", "42,156.87"],
          ["2024", "2", "510,045.03", "205,256.02"],
        ]);

        openNotebook();
        getNotebookStep("summarize").icon("play").should("be.visible");
      });
    });
  });

  describe("when expression contains a standard function with offset", () => {
    it("works with avg", () => {
      const customColumnName = "CC Product Price";

      openTable({ table: ORDERS_ID });

      openNotebook();

      addCustomColumn({
        name: customColumnName,
        formula: "[Product → Rating]",
      });

      summarize({ mode: "notebook" });

      addCustomAggregation({
        formula: `Average([${customColumnName}])`,
        name: "Average product rating",
        isFirst: true,
      });
      addCustomAggregation({
        formula: `Offset(Average([${customColumnName}]), -1)`,
        name: "offsetted average product rating",
      });

      addSummaryGroupingField({
        field: customColumnName,
      });
      addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
      addSorting({ field: customColumnName, order: "desc" });

      visualize();

      verifyNoQuestionError();
      verifyTableContent([
        ["5", "2022", "5", ""],
        ["5", "2023", "5", "5"],
        ["5", "2024", "5", "5"],
        ["5", "2025", "5", "5"],
        ["5", "2026", "5", "5"],
        ["4.8", "2022", "4.8", ""],
        ["4.8", "2023", "4.8", "4.8"],
        ["4.8", "2024", "4.8", "4.8"],
        ["4.8", "2025", "4.8", "4.8"],
        ["4.8", "2026", "4.8", "4.8"],
      ]);
    });

    it("works with 3 breakouts", () => {
      const customColumnName = "CC Product Rating";

      openTable({ table: ORDERS_ID });

      openNotebook();

      addCustomColumn({
        name: customColumnName,
        formula: "[Product → Rating]",
      });

      summarize({ mode: "notebook" });

      addSummaryField({ metric: "Sum of ...", field: "Total" });
      addCustomAggregation({
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });

      addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
      addSummaryGroupingField({
        field: customColumnName,
      });
      addSummaryGroupingField({
        table: "User",
        field: "Source",
      });
      addSorting({ field: "Created At", order: "desc" });

      visualize();

      verifyNoQuestionError();
      verifyTableContent([
        ["2026", "0", "Affiliate", "3,443.41", ""],
        ["2026", "0", "Facebook", "4,014.21", ""],
      ]);
    });
  });

  it("works with filtering using segment", () => {
    const segmentName = "Orders < 100";
    createSegment({
      name: segmentName,
      // @ts-expect-error convert helper to ts
      description: "All orders with a total under $100.",
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
      },
    });

    const customColumnName = "CC Product Rating";

    openTable({ table: ORDERS_ID });

    openNotebook();

    cy.findAllByTestId("action-buttons").first().icon("filter").click();
    popover().findByText("Custom Expression").click();

    enterCustomColumnDetails({
      formula: `[${segmentName}]`,
    });
    popover().findByText("Done").click();

    addCustomColumn({
      name: customColumnName,
      formula: "[Product → Rating]",
    });

    summarize({ mode: "notebook" });

    addSummaryField({ metric: "Sum of ...", field: "Total" });
    addCustomAggregation({
      formula: "Offset(Sum([Total]), -1)",
      name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
    });

    addSummaryGroupingField({ field: "Created At", bucketSize: "Year" });
    addSummaryGroupingField({
      field: customColumnName,
    });
    addSummaryGroupingField({
      table: "User",
      field: "Source",
    });
    addSorting({ field: "Created At", order: "desc" });

    visualize();

    verifyNoQuestionError();
    verifyTableContent([
      ["2026", "0", "Affiliate", "1,303.43", ""],
      ["2026", "0", "Facebook", "1,835.1", ""],
    ]);
  });

  it("should work with metrics (metabase#47854)", () => {
    const metricName = "Count of orders";
    const ORDERS_SCALAR_METRIC: StructuredQuestionDetails = {
      name: metricName,
      type: "metric",
      description: "A metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
      },
      display: "scalar",
    };

    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );

    openNotebook();

    addCustomAggregation({
      formula: `Offset([${metricName}], -1)`,
      name: "Count of orders (previous month)",
    });

    visualize();

    cy.findByTestId("chart-container").should("contain", "January 2024");
  });
});

function addCustomAggregation({
  formula,
  name,
  isFirst,
  isOpened,
}: {
  formula: string;
  name: string;
  isFirst?: boolean;
  isOpened?: boolean;
}) {
  if (!isOpened) {
    if (isFirst) {
      getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
    } else {
      getNotebookStep("summarize").icon("add").first().click();
    }
  }

  popover().findByText("Custom Expression").click();
  enterCustomColumnDetails({ formula, name });
  popover().button("Done").click();
}

function addBreakout(name: string) {
  getNotebookStep("summarize").findByText("Pick a column to group by").click();
  popover().findByText(name).click();
}

function saveQuestion() {
  cy.button("Save").click();
  modal().button("Save").click();
  return cy.wait("@saveQuestion");
}

function verifyLineChart({
  xAxis,
  yAxis,
  legendItems,
}: {
  xAxis: string;
  yAxis?: string;
  legendItems?: string[];
}) {
  echartsContainer().within(() => {
    cy.findByText(xAxis).should("be.visible");

    if (yAxis) {
      cy.findByText(yAxis).should("be.visible");
    }
  });

  if (legendItems) {
    for (const legendItem of legendItems) {
      cy.findAllByTestId("legend-item").contains(legendItem).should("exist");
    }
  }
}

function verifyTableContent(rows: string[][]) {
  const columnsCount = rows[0].length;
  const pairs = rows.flatMap((row, rowIndex) => {
    return row.map((text, cellIndex) => {
      const index = rowIndex * columnsCount + cellIndex;
      return { index, text };
    });
  });

  for (const { index, text } of pairs) {
    verifyTableCellContent(index, text);
  }
}

function verifyTableCellContent(index: number, text: string) {
  cy.findAllByRole("gridcell").eq(index).should("have.text", text);
}

function verifyQuestionError(error: string) {
  cy.findByTestId("query-builder-main").within(() => {
    cy.findByText("There was a problem with your question").should("exist");
    cy.findByText("Show error details").click();
    cy.findByText(error).should("exist");
  });
}

function verifyNoQuestionError() {
  cy.findByTestId("query-builder-main").within(() => {
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.findByText("Show error details").should("not.exist");
  });
}

function verifyInvalidColumnName(
  columnName: string,
  prefix: string,
  expression: string,
) {
  enterCustomColumnDetails({ formula: prefix });
  cy.findByTestId("expression-suggestions-list-item").should("not.exist");

  enterCustomColumnDetails({ formula: expression });
  cy.realPress("Tab");
  popover().within(() => {
    cy.findByText(`Unknown Field: ${columnName}`).should("be.visible");
    cy.button("Done").should("be.disabled");
  });
}

function createOffsetOptions(name = "offset") {
  return {
    "lib/uuid": uuid(),
    name,
    "display-name": name,
  };
}

function addSorting({
  field,
  order = "asc",
}: {
  field: string;
  order?: "asc" | "desc";
}) {
  startSort();
  popover().contains(field).click();

  if (order === "desc") {
    getNotebookStep("sort").contains(field).click();
  }
}

function addCustomColumn({ name, formula }: { name: string; formula: string }) {
  cy.findAllByLabelText("Custom column").last().click();

  enterCustomColumnDetails({
    formula,
    name,
  });
  popover().findByText("Done").click();
}
