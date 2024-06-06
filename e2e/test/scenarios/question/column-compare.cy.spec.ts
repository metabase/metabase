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

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

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

  describe("single aggregation", () => {
    it("no breakout", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_NO_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      verifySummarizeText({
        itemName: "Compare “Count” to previous period ...",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on grouping",
      });

      cy.log("chill mode - column drill");
      verifyColumnDrillText({
        itemName: "Compare “Count” to previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on grouping",
      });

      cy.log("chill mode - plus button");
      verifyPlusButtonText({
        itemName: "Compare “Count” to previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on grouping",
      });

      cy.log("notebook editor");
      verifyNotebookText({
        itemName: "Compare “Count” to previous period ...",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on grouping",
      });

      toggleColumnPickerItems(["Percentage difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: ["offset", "count"],
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        { name: "Count (previous period)", expression: "Offset(Count, -1)" },
      ]);
      verifyBreakoutRequiredError();
    });

    it("breakout on binned datetime column", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      verifySummarizeText({
        itemName: "Compare “Count” to previous months ...",
        step2Title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("chill mode - column drill");
      verifyColumnDrillText({
        itemName: "Compare “Count” to previous months",
        step2Title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("chill mode - plus button");
      verifyPlusButtonText({
        itemName: "Compare “Count” to previous months",
        step2Title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("notebook editor");
      verifyNotebookText({
        itemName: "Compare “Count” to previous months ...",
        step2Title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      toggleColumnPickerItems(["Percentage difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: ["offset", "count"],
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        { name: "Count (previous month)", expression: "Offset(Count, -1)" },
      ]);
      verifyColumns(["Count (previous month)"]);
    });

    it("breakout on non-binned datetime column", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      verifySummarizeText({
        itemName: "Compare “Count” to previous period ...",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("chill mode - column drill");
      verifyColumnDrillText({
        itemName: "Compare “Count” to previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("chill mode - plus button");
      verifyPlusButtonText({
        itemName: "Compare “Count” to previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("notebook editor");
      verifyNotebookText({
        itemName: "Compare “Count” to previous period ...",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      toggleColumnPickerItems(["Percentage difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: ["offset", "count"],
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        { name: "Count (previous period)", expression: "Offset(Count, -1)" },
      ]);
      verifyColumns(["Count (previous period)"]);
    });

    it("breakout on non-datetime column", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      verifySummarizeText({
        itemName: "Compare “Count” to previous rows ...",
        step2Title: "Compare “Count” to previous rows",
        offsetHelp: "rows above based on “Category”",
      });

      cy.log("chill mode - column drill");
      verifyColumnDrillText({
        itemName: "Compare “Count” to previous rows",
        step2Title: "Compare “Count” to previous rows",
        offsetHelp: "rows above based on “Category”",
      });

      cy.log("chill mode - plus button");
      verifyPlusButtonText({
        itemName: "Compare “Count” to previous rows",
        step2Title: "Compare “Count” to previous rows",
        offsetHelp: "rows above based on “Category”",
      });

      cy.log("notebook editor");
      verifyNotebookText({
        itemName: "Compare “Count” to previous rows ...",
        step2Title: "Compare “Count” to previous rows",
        offsetHelp: "rows above based on “Category”",
      });

      toggleColumnPickerItems(["Percentage difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: ["offset", "count"],
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous value)",
          expression: "Offset(Count, -1)",
        },
      ]);
      verifyColumns(["Count (previous value)"]);
    });
  });

  describe("multiple aggregations", () => {
    const customExpressionsUsed = [
      "offset",
      "count",
      "-",
      "count",
      "offset",
      "count",
    ];

    it("no breakout", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_AGGREGATIONS_NO_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      verifySummarizeText({
        itemName: "Compare to previous period ...",
        step1Title: "Compare one of these to the previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on grouping",
      });

      cy.log("chill mode - column drill");
      verifyColumnDrillText({
        itemName: "Compare “Count” to previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on grouping",
      });

      cy.log("chill mode - plus button");
      verifyPlusButtonText({
        itemName: "Compare to previous period",
        step1Title: "Compare one of these to the previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on grouping",
      });

      cy.log("notebook editor");
      verifyNotebookText({
        itemName: "Compare to previous period ...",
        step1Title: "Compare one of these to the previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on grouping",
      });

      toggleColumnPickerItems(["Percentage difference", "Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: customExpressionsUsed,
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
      ]);
      verifyBreakoutRequiredError();
    });

    it("breakout on binned datetime column", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_AGGREGATIONS_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      verifySummarizeText({
        itemName: "Compare to previous months ...",
        step1Title: "Compare one of these to the previous months",
        step2Title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("chill mode - column drill");
      verifyColumnDrillText({
        itemName: "Compare “Count” to previous months",
        step2Title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("chill mode - plus button");
      verifyPlusButtonText({
        itemName: "Compare to previous months",
        step1Title: "Compare one of these to the previous months",
        step2Title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("notebook editor");
      verifyNotebookText({
        itemName: "Compare to previous months ...",
        step1Title: "Compare one of these to the previous months",
        step2Title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      toggleColumnPickerItems(["Percentage difference", "Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: customExpressionsUsed,
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
      ]);
      verifyColumns(["Count (previous month)", "Count (vs previous month)"]);
    });

    it("breakout on non-binned datetime column", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_AGGREGATIONS_NON_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      verifySummarizeText({
        itemName: "Compare to previous period ...",
        step1Title: "Compare one of these to the previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("chill mode - column drill");
      verifyColumnDrillText({
        itemName: "Compare “Count” to previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("chill mode - plus button");
      verifyPlusButtonText({
        itemName: "Compare to previous period",
        step1Title: "Compare one of these to the previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("notebook editor");
      verifyNotebookText({
        itemName: "Compare to previous period ...",
        step1Title: "Compare one of these to the previous period",
        step2Title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      toggleColumnPickerItems(["Percentage difference", "Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: customExpressionsUsed,
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
      ]);
      verifyColumns(["Count (previous period)", "Count (vs previous period)"]);
    });

    it("breakout on non-datetime column", () => {
      createQuestion(
        { query: QUERY_MULTIPLE_AGGREGATIONS_NON_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.log("chill mode - summarize sidebar");
      verifySummarizeText({
        itemName: "Compare to previous rows ...",
        step2Title: "Compare “Count” to previous rows",
        step1Title: "Compare one of these to the previous rows",
        offsetHelp: "rows above based on “Category”",
      });

      cy.log("chill mode - column drill");
      verifyColumnDrillText({
        itemName: "Compare “Count” to previous rows",
        step2Title: "Compare “Count” to previous rows",
        offsetHelp: "rows above based on “Category”",
      });

      cy.log("chill mode - plus button");
      verifyPlusButtonText({
        itemName: "Compare to previous rows",
        step2Title: "Compare “Count” to previous rows",
        step1Title: "Compare one of these to the previous rows",
        offsetHelp: "rows above based on “Category”",
      });

      cy.log("notebook editor");
      verifyNotebookText({
        itemName: "Compare to previous rows ...",
        step2Title: "Compare “Count” to previous rows",
        step1Title: "Compare one of these to the previous rows",
        offsetHelp: "rows above based on “Category”",
      });

      toggleColumnPickerItems(["Percentage difference", "Value difference"]);
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: customExpressionsUsed,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });

      verifyAggregations([
        {
          name: "Count (previous value)",
          expression: "Offset(Count, -1)",
        },
        {
          name: "Count (vs previous value)",
          expression: "Count - Offset(Count, -1)",
        },
      ]);
      verifyColumns(["Count (previous value)", "Count (vs previous value)"]);
    });
  });
});

function toggleColumnPickerItems(names: string[]) {
  cy.findByTestId("column-picker").click({ force: true });

  for (const name of names) {
    cy.findAllByTestId("column-picker-item").contains(name).click();
  }

  cy.findByTestId("column-picker").click({ force: true });
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
    cy.findByText(options.itemName).should("exist").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("exist");
      cy.findByText("Sum of Price").should("exist");
      cy.findByText("Count").click();
    }

    cy.findByText(options.step2Title).should("exist");
    cy.findByText(options.offsetHelp).should("exist");
  });
}

function verifyColumnDrillText(options: Omit<CheckTextOpts, "step1Title">) {
  tableHeaderClick("Count");

  popover().within(() => {
    cy.findByText(options.itemName).should("exist").click();
    cy.findByText(options.step2Title).should("exist");
    cy.findByText(options.offsetHelp).should("exist");
  });
}

function verifyPlusButtonText(options: CheckTextOpts) {
  cy.button("Add column").click();

  popover().within(() => {
    cy.findByText(options.itemName).should("exist").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("exist");
      cy.findByText("Sum of Price").should("exist");
      cy.findByText("Count").click();
    }

    cy.findByText(options.step2Title).should("exist");
    cy.findByText(options.offsetHelp).should("exist");
  });
}

function verifyNotebookText(options: CheckTextOpts) {
  openNotebook();
  getNotebookStep("summarize")
    .findByTestId("aggregate-step")
    .icon("add")
    .click();

  popover().within(() => {
    cy.findByText(options.itemName).should("exist").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("exist");
      cy.findByText("Sum of Price").should("exist");
      cy.findByText("Count").should("exist").click();
    }

    cy.findByText(options.step2Title).should("exist");
    cy.findByText(options.offsetHelp).should("exist");
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
      .should("exist")
      .click();

    cy.get(".ace_content").should("have.text", result.expression);

    cy.realPress("Escape");
  }
}

function verifyColumns(names: string[]) {
  visualize();

  for (const name of names) {
    cy.findAllByTestId("header-cell").contains(name).should("exist");
  }
}

function verifyBreakoutRequiredError() {
  visualize();

  cy.get("main")
    .findByText("There was a problem with your question")
    .should("exist");
  cy.get("main").findByText("Show error details").should("exist").click();
  cy.get("main")
    .findByText(
      "Window function requires either breakouts or order by in the query",
    )
    .should("exist");
}
