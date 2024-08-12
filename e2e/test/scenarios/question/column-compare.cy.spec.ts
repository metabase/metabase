import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  getNotebookStep,
  openNotebook,
  popover,
  resetSnowplow,
  restore,
  rightSidebar,
  tableHeaderClick,
  visualize,
} from "e2e/support/helpers";
import type { FieldReference, StructuredQuery } from "metabase-types/api";

const { PRODUCTS_ID, PRODUCTS, ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const FIELD_PRICE: FieldReference = [
  "field",
  PRODUCTS.PRICE,
  { "base-type": "type/Float" },
];

const BREAKOUT_BINNED_DATETIME: FieldReference = [
  "field",
  PRODUCTS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

const BREAKOUT_NON_BINNED_DATETIME: FieldReference = [
  "field",
  PRODUCTS.CREATED_AT,
  { "base-type": "type/DateTime" },
];

const BREAKOUT_NON_DATETIME: FieldReference = [
  "field",
  PRODUCTS.CATEGORY,
  { "base-type": "type/Text" },
];

const BREAKOUT_OTHER_DATETIME: FieldReference = [
  "field",
  PEOPLE.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
    "source-field": ORDERS.USER_ID,
  },
];

const QUERY_NO_AGGREGATION: StructuredQuery = {
  "source-table": PRODUCTS_ID,
};

const QUERY_SINGLE_AGGREGATION_NO_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
};

const QUERY_MULTIPLE_AGGREGATIONS_NO_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"], ["sum", FIELD_PRICE]],
};

const QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [BREAKOUT_BINNED_DATETIME],
};

const QUERY_SINGLE_AGGREGATION_OTHER_DATETIME: StructuredQuery = {
  "source-table": ORDERS_ID,
  aggregation: [["count"]],
  breakout: [BREAKOUT_OTHER_DATETIME],
};

const QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [BREAKOUT_NON_BINNED_DATETIME],
};

const QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [BREAKOUT_NON_DATETIME],
};

const QUERY_MULTIPLE_AGGREGATIONS_BINNED_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"], ["sum", FIELD_PRICE]],
  breakout: [BREAKOUT_BINNED_DATETIME],
};

const QUERY_MULTIPLE_AGGREGATIONS_NON_BINNED_DATETIME_BREAKOUT: StructuredQuery =
  {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"], ["sum", FIELD_PRICE]],
    breakout: [BREAKOUT_NON_BINNED_DATETIME],
  };

const QUERY_MULTIPLE_AGGREGATIONS_NON_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"], ["sum", FIELD_PRICE]],
  breakout: [BREAKOUT_NON_DATETIME],
};

const QUERY_MULTIPLE_BREAKOUTS: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [BREAKOUT_NON_DATETIME, BREAKOUT_BINNED_DATETIME],
};

const QUERY_MULTIPLE_TEMPORAL_BREAKOUTS: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [
    BREAKOUT_NON_DATETIME,
    BREAKOUT_BINNED_DATETIME,
    BREAKOUT_NON_BINNED_DATETIME,
  ],
};

const CUSTOM_EXPRESSIONS_USED = [
  "offset",
  "count",
  "-",
  "count",
  "offset",
  "count",
  "-",
  "/",
  "count",
  "offset",
  "count",
];

describeWithSnowplow("scenarios > question > column compare TODO", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  describe("no aggregations", () => {
    it("does not show column compare shortcut", () => {
      createQuestion(
        { query: QUERY_NO_AGGREGATION },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      cy.button("Summarize").click();
      rightSidebar().button("Count").icon("close").click();
      rightSidebar().button("Add aggregation").click();
      verifyNoColumnCompareShortcut();

      cy.log("chill mode - column drill");
      tableHeaderClick("Title");
      verifyNoColumnCompareShortcut();

      cy.log("chill mode - plus button");
      cy.button("Add column").click();
      verifyNoColumnCompareShortcut();

      cy.log("notebook editor");
      openNotebook();
      cy.button("Summarize").click();
      verifyNoColumnCompareShortcut();
    });
  });

  describe("no temporal columns", () => {
    beforeEach(() => {
      cy.request("PUT", `/api/field/${PRODUCTS.CREATED_AT}`, {
        base_type: "type/Text",
      });
    });

    it("no breakout", () => {
      createQuestion(
        { query: QUERY_NO_AGGREGATION },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      cy.button("Summarize").click();
      rightSidebar().button("Count").icon("close").click();
      rightSidebar().button("Add aggregation").click();
      verifyNoColumnCompareShortcut();

      cy.log("chill mode - column drill");
      tableHeaderClick("Title");
      verifyNoColumnCompareShortcut();

      cy.log("chill mode - plus button");
      cy.button("Add column").click();
      verifyNoColumnCompareShortcut();

      cy.log("notebook editor");
      openNotebook();
      cy.button("Summarize").click();
      verifyNoColumnCompareShortcut();
    });

    it("one breakout", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      cy.button("Summarize").click();
      rightSidebar().button("Count").icon("close").click();
      rightSidebar().button("Add aggregation").click();
      verifyNoColumnCompareShortcut();

      cy.log("chill mode - column drill");
      tableHeaderClick("Category");
      verifyNoColumnCompareShortcut();

      cy.log("chill mode - plus button");
      cy.button("Add column").click();
      verifyNoColumnCompareShortcut();

      cy.log("notebook editor");
      openNotebook();
      cy.button("Summarize").click();
      verifyNoColumnCompareShortcut();
    });
  });

  describe("single aggregation", () => {
    it("no breakout", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_NO_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on grouping",
      });

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on grouping",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on grouping",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on grouping",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyBreakoutExistsAndIsFirst({
        column: "Created At",
        bucket: "Month",
      });

      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);
    });

    it("breakout on binned datetime column", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      tableHeaderClick("Created At: Month");
      verifyNoColumnCompareShortcut();

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);
      verifyBreakoutExistsAndIsFirst({ column: "Created At", bucket: "Month" });

      verifyColumns([
        "Count (previous month)",
        "Count (vs previous month)",
        "Count (% vs previous month)",
      ]);
    });

    it("breakout on non-binned datetime column", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on “Created At”",
      });

      tableHeaderClick("Created At: Day");
      verifyNoColumnCompareShortcut();

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on “Created At”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on “Created At”",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on “Created At”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous period)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous period)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous period)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);

      verifyColumns([
        "Count (previous period)",
        "Count (vs previous period)",
        "Count (% vs previous period)",
      ]);
    });

    it("breakout on non-datetime column", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      tableHeaderClick("Category");
      verifyNoColumnCompareShortcut();

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      openNotebook();

      cy.button("Summarize").click();
      verifyNoColumnCompareShortcut();
      cy.realPress("Escape");

      openVisualization();

      verifyNotebookText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);

      verifyBreakoutExistsAndIsFirst({
        column: "Created At",
        bucket: "Month",
      });

      verifyColumns([
        "Count (previous month)",
        "Count (vs previous month)",
        "Count (% vs previous month)",
      ]);
    });

    it("multiple breakouts", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_BREAKOUTS },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);

      verifyBreakoutExistsAndIsFirst({ column: "Created At", bucket: "Month" });
      breakout({ column: "Category" }).should("exist");

      verifyColumns([
        "Count (previous month)",
        "Count (vs previous month)",
        "Count (% vs previous month)",
      ]);
    });

    it("multiple temporal breakouts", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_TEMPORAL_BREAKOUTS },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);

      verifyBreakoutExistsAndIsFirst({ column: "Created At", bucket: "Month" });
      breakout({ column: "Category" }).should("exist");
      breakout({ column: "Created At" }).should("exist");

      verifyColumns([
        "Count (previous month)",
        "Count (vs previous month)",
        "Count (% vs previous month)",
      ]);
    });

    it("one breakout on non-default datetime column", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_OTHER_DATETIME },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      tableHeaderClick("Count");
      verifyNoColumnCompareShortcut();

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);

      verifyBreakoutExistsAndIsFirst({
        column: "User → Created At",
        bucket: "Month",
      });
      breakout({ column: "Created At", bucket: "Month" }).should("not.exist");

      verifyColumns([
        "Count (previous month)",
        "Count (vs previous month)",
        "Count (% vs previous month)",
      ]);
    });
  });

  describe("multiple aggregations", () => {
    it("no breakout", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_AGGREGATIONS_NO_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on grouping",
      });

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on grouping",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on grouping",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on grouping",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyBreakoutExistsAndIsFirst({ column: "Created At", bucket: "Month" });
      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);
    });

    it("breakout on binned datetime column", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_AGGREGATIONS_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      tableHeaderClick("Created At: Month");
      verifyNoColumnCompareShortcut();

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "months ago based on “Created At”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);

      verifyColumns([
        "Count (previous month)",
        "Count (vs previous month)",
        "Count (% vs previous month)",
      ]);
    });

    it("breakout on non-binned datetime column", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_AGGREGATIONS_NON_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on “Created At”",
      });

      tableHeaderClick("Created At: Day");
      verifyNoColumnCompareShortcut();

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on “Created At”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on “Created At”",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step1Title: "Compare one of these to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "periods ago based on “Created At”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous period)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous period)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous period)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);

      verifyColumns([
        "Count (previous period)",
        "Count (vs previous period)",
        "Count (% vs previous period)",
      ]);
    });

    it("breakout on non-datetime column", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_AGGREGATIONS_NON_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      verifySummarizeText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        step1Title: "Compare one of these to the past",
        offsetHelp: "rows above based on “Category”",
      });

      tableHeaderClick("Category");
      verifyNoColumnCompareShortcut();

      verifyColumnDrillText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        offsetHelp: "rows above based on “Category”",
      });

      verifyPlusButtonText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        step1Title: "Compare one of these to the past",
        offsetHelp: "rows above based on “Category”",
      });

      verifyNotebookText({
        itemName: "Compare to the past",
        step2Title: "Compare “Count” to the past",
        step1Title: "Compare one of these to the past",
        offsetHelp: "rows above based on “Category”",
      });

      toggleColumnPickerItems(["Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous month)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous month)",
          expression: "Count - Offset(Count, -1)",
        },
        {
          name: "Count (% vs previous month)",
          expression: "Count / Offset(Count, -1) - 1",
        },
      ]);

      verifyColumns([
        "Count (previous month)",
        "Count (vs previous month)",
        "Count (% vs previous month)",
      ]);
    });
  });
});

function toggleColumnPickerItems(names: string[]) {
  cy.findByTestId("column-picker").parent().click();

  for (const name of names) {
    cy.findAllByTestId("column-picker-item").contains(name).click();
  }

  cy.findByTestId("column-picker").parent().click();
}

function verifyNoColumnCompareShortcut() {
  popover()
    .findByText(/compare/)
    .should("not.exist");
}

type CheckTextOpts = {
  itemName: string;
  step1Title?: string;
  step2Title: string;
  offsetHelp: string;
};

function verifySummarizeText(options: CheckTextOpts) {
  cy.button("Summarize").click();
  rightSidebar().button("Add aggregation").click();

  popover().within(() => {
    cy.findByText(options.itemName).should("be.visible").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("be.visible");
      cy.findByText("Sum of Price").should("be.visible");
      cy.findByText("Count").click();
    }

    cy.findByText(options.step2Title).should("be.visible");
    cy.findByText(options.offsetHelp).should("be.visible");
  });
}

function verifyColumnDrillText(options: Omit<CheckTextOpts, "step1Title">) {
  tableHeaderClick("Count");

  popover().within(() => {
    cy.findByText(options.itemName).should("be.visible").click();
    cy.findByText(options.step2Title).should("be.visible");
    cy.findByText(options.offsetHelp).should("be.visible");
  });
}

function verifyPlusButtonText(options: CheckTextOpts) {
  cy.button("Add column").click();

  popover().within(() => {
    cy.findByText(options.itemName).should("be.visible").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("be.visible");
      cy.findByText("Sum of Price").should("be.visible");
      cy.findByText("Count").click();
    }

    cy.findByText(options.step2Title).should("be.visible");
    cy.findByText(options.offsetHelp).should("be.visible");
  });
}

function verifyNotebookText(options: CheckTextOpts) {
  openNotebook();
  getNotebookStep("summarize")
    .findAllByTestId("aggregate-step")
    .last()
    .icon("add")
    .click();

  popover().within(() => {
    cy.findByText(options.itemName).should("be.visible").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("be.visible");
      cy.findByText("Sum of Price").should("be.visible");
      cy.findByText("Count").should("be.visible").click();
    }

    cy.findByText(options.step2Title).should("be.visible");
    cy.findByText(options.offsetHelp).should("be.visible");
  });
}

type AggregationResult = {
  name: string;
  expression: string;
};

function verifyAggregations(results: AggregationResult[]) {
  for (const result of results) {
    cy.findByTestId("aggregate-step")
      .findByText(result.name)
      .should("be.visible")
      .click();

    cy.get(".ace_content").should("have.text", result.expression);

    cy.realPress("Escape");
  }
}

function verifyColumns(names: string[]) {
  visualize();

  for (const name of names) {
    cy.findAllByTestId("header-cell").contains(name).should("be.visible");
  }
}

function breakout({ column, bucket }: { column: string; bucket?: string }) {
  const name = bucket ? `${column}: ${bucket}` : column;
  return cy.findByTestId("breakout-step").findByText(name);
}

function verifyBreakoutExistsAndIsFirst(options: {
  column: string;
  bucket?: string;
}) {
  breakout(options)
    .should("exist")
    .parent()
    .parent()
    .should("match", ":first-child");
}

function openVisualization() {
  cy.button("Show Visualization").click();
}
