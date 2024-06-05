import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  getNotebookStep,
  openNotebook,
  popover,
  resetSnowplow,
  restore,
  tableHeaderClick,
} from "e2e/support/helpers";
import type { FieldReference } from "metabase-types/api";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const BREAKOUT_CREATED_AT_MONTH: FieldReference = [
  "field",
  PRODUCTS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

describeWithSnowplow("scenarios > question > column compare", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();

    createQuestion(
      {
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [BREAKOUT_CREATED_AT_MONTH],
        },
      },
      { visitQuestion: true, wrapId: true, idAlias: "questionId" },
    );
  });

  describe("notebook editor", () => {
    it("should create a snowplow event for the column compare action", () => {
      openNotebook();
      getNotebookStep("summarize")
        .findByTestId("aggregate-step")
        .icon("add")
        .click();

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
      cy.button("Summarize").click();
      cy.button("Add aggregation").click();

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

  describe.skip("chill mode - plus button", () => {
    it("should create a snowplow event for the column compare action", () => {});
  });
});

function toggleColumnPicker() {
  cy.findByTestId("column-picker").click({ force: true });
}

function toggleColumnPickerItem(name: string) {
  cy.findAllByTestId("column-picker-item").contains(name).click();
}
