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

    describe("notebook editor", () => {
      it("does not show column compare shortcut", () => {
        openNotebook();
        cy.button("Summarize").click();
        assertNoColumnCompareShortcut();
      });
    });

    describe("chill mode - summarize sidebar", () => {
      it("does not show column compare shortcut", () => {
        cy.button("Summarize").click();
        rightSidebar().button("Count").icon("close").click();
        rightSidebar().button("Add aggregation").click();
        assertNoColumnCompareShortcut();
      });
    });

    // TODO move this test and rename ?
    describe.skip("chill mode - column header drill", () => {
      it("does not show column compare shortcut", () => {
        tableHeaderClick("Title");
        assertNoColumnCompareShortcut();
      });
    });

    describe("chill mode - plus button", () => {
      it("does not show column compare shortcut", () => {
        cy.button("Add column").click();
        assertNoColumnCompareShortcut();
      });
    });
  });

  describe("single aggregation", () => {
    beforeEach(() => {
      createQuestion(
        { query: QUERY_SINGLE_AGGREGATION },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );
    });

    describe("notebook editor", () => {
      it("shows correct label", () => {
        openNotebook();
        startNewAggregation();

        popover()
          .findByText("Compare “Count” to previous period ...")
          .should("exist")
          .click();

        popover()
          .findByText("Compare “Count” to previous period")
          .should("exist");
      });
    });

    describe("chill mode - summarize sidebar", () => {
      it("shows correct label", () => {});
    });

    describe("chill mode - column header drill", () => {
      it("shows correct label", () => {});
    });

    describe("chill mode - plus button", () => {
      it("shows correct label", () => {});
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
