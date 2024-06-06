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
} from "e2e/support/helpers";
import type { FieldReference, StructuredQuery } from "metabase-types/api";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const PRICE_FIELD: FieldReference = [
  "field",
  PRODUCTS.PRICE,
  { "base-type": "type/Float" },
];

const BINNED_DATETIME_BREAKOUT: FieldReference = [
  "field",
  PRODUCTS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

const NON_BINNED_DATETIME_BREAKOUT: FieldReference = [
  "field",
  PRODUCTS.CREATED_AT,
  { "base-type": "type/DateTime" },
];

const NON_DATETIME_BREAKOUT: FieldReference = [
  "field",
  PRODUCTS.CATEGORY,
  { "base-type": "type/Text" },
];

const QUERY_NO_AGGREGATION: StructuredQuery = {
  "source-table": PRODUCTS_ID,
};

const QUERY_SINGLE_AGGREGATION: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
};

const QUERY_MULTIPLE_AGGREGATIONS: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"], ["sum", PRICE_FIELD]],
};

const QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [BINNED_DATETIME_BREAKOUT],
};

const QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [NON_BINNED_DATETIME_BREAKOUT],
};

const QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [NON_DATETIME_BREAKOUT],
};

const QUERY_MULTIPLE_AGGREGATIONS_BINNED_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"], ["sum", PRICE_FIELD]],
  breakout: [BINNED_DATETIME_BREAKOUT],
};

const QUERY_MULTIPLE_AGGREGATIONS_NON_BINNED_DATETIME_BREAKOUT: StructuredQuery =
  {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"], ["sum", PRICE_FIELD]],
    breakout: [NON_BINNED_DATETIME_BREAKOUT],
  };

const QUERY_MULTIPLE_AGGREGATIONS_NON_DATETIME_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"], ["sum", PRICE_FIELD]],
  breakout: [NON_DATETIME_BREAKOUT],
};

describe("scenarios > question > column compare TODO", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
  });

  describe("no aggregations", () => {
    beforeEach(() => {
      createQuestion(
        { query: QUERY_NO_AGGREGATION },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );
    });

    it("does not show column compare shortcut", () => {
      cy.log("chill mode - summarize sidebar");

      cy.button("Summarize").click();
      rightSidebar().button("Count").icon("close").click();
      rightSidebar().button("Add aggregation").click();
      assertNoColumnCompareShortcut();

      // TODO move this test and rename ?
      // cy.log("chill mode - column header drill");
      //
      // tableHeaderClick("Title");
      // assertNoColumnCompareShortcut();

      cy.log("chill mode - plus button");

      cy.button("Add column").click();
      assertNoColumnCompareShortcut();

      cy.log("notebook editor");

      openNotebook();
      cy.button("Summarize").click();
      assertNoColumnCompareShortcut();
    });
  });

  describe("single aggregation", () => {
    describe("no breakout", () => {
      beforeEach(() => {
        createQuestion(
          { query: QUERY_SINGLE_AGGREGATION },
          { visitQuestion: true, wrapId: true, idAlias: "questionId" },
        );
      });

      it("shows correct shortcut label and popover title", () => {
        cy.log("chill mode - summarize sidebar");
        checkSummarizeText({
          itemName: "Compare “Count” to previous period ...",
          title: "Compare “Count” to previous period",
          offsetHelp: "periods ago based on grouping",
        });

        cy.log("chill mode - column drill");
        checkColumnDrillText({
          itemName: "Compare “Count” to previous period",
          title: "Compare “Count” to previous period",
          offsetHelp: "periods ago based on grouping",
        });

        cy.log("chill mode - plus button");
        checkPlusButtonText({
          itemName: "Compare “Count” to previous period",
          title: "Compare “Count” to previous period",
          offsetHelp: "periods ago based on grouping",
        });

        cy.log("notebook editor");
        checkNotebookText({
          itemName: "Compare “Count” to previous period ...",
          title: "Compare “Count” to previous period",
          offsetHelp: "periods ago based on grouping",
        });
      });
    });
  });

  describe("breakout on binned datetime column", () => {
    beforeEach(() => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );
    });

    it("shows correct shortcut label and popover title", () => {
      cy.log("chill mode - summarize sidebar");
      checkSummarizeText({
        itemName: "Compare “Count” to previous months ...",
        title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("chill mode - column drill");
      checkColumnDrillText({
        itemName: "Compare “Count” to previous months",
        title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("chill mode - plus button");
      checkPlusButtonText({
        itemName: "Compare “Count” to previous months",
        title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });

      cy.log("notebook editor");
      checkNotebookText({
        itemName: "Compare “Count” to previous months ...",
        title: "Compare “Count” to previous months",
        offsetHelp: "months ago based on “Created At”",
      });
    });
  });

  describe("breakout on non-binned datetime column", () => {
    beforeEach(() => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );
    });

    it("shows correct shortcut label and popover title", () => {
      cy.log("chill mode - summarize sidebar");
      checkSummarizeText({
        itemName: "Compare “Count” to previous period ...",
        title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("chill mode - column drill");
      checkColumnDrillText({
        itemName: "Compare “Count” to previous period",
        title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("chill mode - plus button");
      checkPlusButtonText({
        itemName: "Compare “Count” to previous period",
        title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });

      cy.log("notebook editor");
      checkNotebookText({
        itemName: "Compare “Count” to previous period ...",
        title: "Compare “Count” to previous period",
        offsetHelp: "periods ago based on “Created At”",
      });
    });
  });
});

describeWithSnowplow("scenarios > question > column compare", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  describe("notebook editor", () => {
    it("should create a snowplow event for the column compare action", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      openNotebook();
      startNewAggregation();

      popover().findByText("Compare “Count” to previous months ...").click();
      toggleColumnPicker();
      toggleColumnPickerItem("Percentage difference");
      toggleColumnPicker();
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: ["offset", "count"],
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });
    });
  });

  describe("chill mode - summarize sidebar", () => {
    it("should create a snowplow event for the column compare action", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.button("Summarize").click();
      rightSidebar().button("Add aggregation").click();

      popover().findByText("Compare “Count” to previous months ...").click();
      toggleColumnPicker();
      toggleColumnPickerItem("Percentage difference");
      toggleColumnPicker();
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: ["offset", "count"],
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });
    });
  });

  describe("chill mode - column header drill", () => {
    it("should create a snowplow event for the column compare action", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      tableHeaderClick("Count");

      popover().findByText("Compare “Count” to previous months").click();
      toggleColumnPicker();
      toggleColumnPickerItem("Percentage difference");
      toggleColumnPicker();
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_column_header",
          custom_expressions_used: ["offset", "count"],
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });
    });
  });

  describe("chill mode - plus button", () => {
    it("should create a snowplow event for the column compare action", () => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.button("Add column").click();

      popover().findByText("Compare “Count” to previous months").click();
      toggleColumnPicker();
      toggleColumnPickerItem("Percentage difference");
      toggleColumnPicker();
      popover().button("Done").click();

      cy.get("@questionId").then(questionId => {
        expectGoodSnowplowEvent({
          event: "column_compare_via_plus_modal",
          custom_expressions_used: ["offset", "count"],
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });
      });
    });
  });
});

function toggleColumnPicker() {
  cy.findByTestId("column-picker").click({ force: true });
}

function toggleColumnPickerItem(name: string) {
  cy.findAllByTestId("column-picker-item").contains(name).click();
}

function startNewAggregation() {
  getNotebookStep("summarize")
    .findByTestId("aggregate-step")
    .icon("add")
    .click();
}

function assertNoColumnCompareShortcut() {
  popover()
    .findByText(/compare/)
    .should("not.exist");
}

type CheckTextOpts = {
  itemName: string;
  title: string;
  offsetHelp: string;
};

function checkSummarizeText({ itemName, title, offsetHelp }: CheckTextOpts) {
  cy.button("Summarize").click();
  rightSidebar().button("Add aggregation").click();
  popover().within(() => {
    cy.findByText(itemName).should("exist").click();
    cy.findByText(title).should("exist");
    cy.findByText(offsetHelp).should("exist");
  });
}

function checkColumnDrillText({ itemName, title, offsetHelp }: CheckTextOpts) {
  tableHeaderClick("Count");
  popover().within(() => {
    cy.findByText(itemName).should("exist").click();
    cy.findByText(title).should("exist");
    cy.findByText(offsetHelp).should("exist");
  });
}

function checkPlusButtonText({ itemName, title, offsetHelp }: CheckTextOpts) {
  cy.button("Add column").click();
  popover().within(() => {
    cy.findByText(itemName).should("exist").click();
    cy.findByText(title).should("exist");
    cy.findByText(offsetHelp).should("exist");
  });
}

function checkNotebookText({ itemName, title, offsetHelp }: CheckTextOpts) {
  openNotebook();
  startNewAggregation();
  popover().within(() => {
    cy.findByText(itemName).should("exist").click();
    cy.findByText(title).should("exist");
    cy.findByText(offsetHelp).should("exist");
  });
}
