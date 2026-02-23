import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
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

const QUERY_TEMPORAL_EXPRESSION_BREAKOUT: StructuredQuery = {
  "source-table": PRODUCTS_ID,
  expressions: {
    "Created At plus one month": [
      "datetime-add",
      [
        "field",
        PRODUCTS.CREATED_AT,
        {
          "base-type": "type/DateTime",
        },
      ],
      1,
      "month",
    ],
  },
  aggregation: [["count"]],
  breakout: [
    [
      "expression",
      "Created At plus one month",
      {
        "base-type": "type/DateTime",
        "temporal-unit": "month",
      },
    ],
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

const CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE = [
  "/",
  "+",
  "offset",
  "count",
  "offset",
  "count",
  "-",
  "count",
  "/",
  "+",
  "offset",
  "count",
  "offset",
  "count",
  "/",
  "count",
  "/",
  "+",
  "offset",
  "count",
  "offset",
  "count",
];

// TODO: reenable test when we reenable the "Compare to the past" components.
describe("scenarios > question", { tags: "@skip" }, () => {
  describe("column compare", () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe("no aggregations", () => {
      it("does not show column compare shortcut", () => {
        H.createQuestion(
          { query: QUERY_NO_AGGREGATION },
          { visitQuestion: true, wrapId: true, idAlias: "questionId" },
        );

        cy.log("chill mode - summarize sidebar");
        cy.button(/Summarize/).click();
        H.rightSidebar().button("Count").icon("close").click();
        H.rightSidebar().button("Add aggregation").click();
        verifyNoColumnCompareShortcut();

        cy.log("chill mode - column drill");
        H.tableHeaderClick("Title");
        verifyNoColumnCompareShortcut();

        cy.log("chill mode - plus button");
        cy.button("Add column").click();
        verifyNoColumnCompareShortcut();

        cy.log("notebook editor");
        H.openNotebook();
        cy.button(/Summarize/).click();
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
        H.createQuestion(
          { query: QUERY_NO_AGGREGATION },
          { visitQuestion: true, wrapId: true, idAlias: "questionId" },
        );

        cy.log("chill mode - summarize sidebar");
        cy.button(/Summarize/).click();
        H.rightSidebar().button("Count").icon("close").click();
        H.rightSidebar().button("Add aggregation").click();
        verifyNoColumnCompareShortcut();

        cy.log("chill mode - column drill");
        H.tableHeaderClick("Title");
        verifyNoColumnCompareShortcut();

        cy.log("chill mode - plus button");
        cy.button("Add column").click();
        verifyNoColumnCompareShortcut();

        cy.log("notebook editor");
        H.openNotebook();
        cy.button("Summarize").click();
        verifyNoColumnCompareShortcut();
      });

      it("one breakout", () => {
        H.createQuestion(
          { query: QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT },
          { visitQuestion: true, wrapId: true, idAlias: "questionId" },
        );

        cy.log("chill mode - summarize sidebar");
        cy.button(/Summarize/).click();
        H.rightSidebar().button("Count").icon("close").click();
        H.rightSidebar().button("Add aggregation").click();
        verifyNoColumnCompareShortcut();

        cy.log("chill mode - column drill");
        H.tableHeaderClick("Category");
        verifyNoColumnCompareShortcut();

        cy.log("chill mode - plus button");
        cy.button("Add column").click();
        verifyNoColumnCompareShortcut();

        cy.log("notebook editor");
        H.openNotebook();
        cy.button("Summarize").click();
        verifyNoColumnCompareShortcut();
      });
    });

    describe("offset", () => {
      it("should be possible to change the temporal bucket through a preset", () => {
        H.createQuestion(
          { query: QUERY_SINGLE_AGGREGATION_NO_BREAKOUT },
          { visitQuestion: true, wrapId: true, idAlias: "questionId" },
        );

        H.openNotebook();
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.getNotebookStep("summarize")
          .findAllByTestId("aggregate-step")
          .last()
          .icon("add")
          .click();

        H.popover().within(() => {
          cy.findByText("Basic functions").click();
          cy.findByText("Compare to the past").click();

          cy.findByText("Previous year").click();
          cy.findByText("Done").click();
        });

        verifyBreakoutExistsAndIsFirst({
          column: "Created At",
          bucket: "Year",
        });

        verifyAggregations([
          {
            name: "Count (previous year)",
            expression: "Offset(Count, -1)",
          },
          {
            name: "Count (% vs previous year)",
            expression: "Count / Offset(Count, -1) - 1",
          },
        ]);
      });

      it("should be possible to change the temporal bucket with a custom offset", () => {
        H.createQuestion(
          { query: QUERY_SINGLE_AGGREGATION_NO_BREAKOUT },
          { visitQuestion: true, wrapId: true, idAlias: "questionId" },
        );

        H.openNotebook();
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.getNotebookStep("summarize")
          .findAllByTestId("aggregate-step")
          .last()
          .icon("add")
          .click();

        H.popover().within(() => {
          cy.findByText("Basic functions").click();
          cy.findByText("Compare to the past").click();

          cy.findByText("Custom...").click();

          cy.findByLabelText("Offset").clear().type("2");
          cy.findByLabelText("Unit").click();
        });

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.popover().last().findByText("Weeks").click();

        H.popover().within(() => {
          cy.findByText("Done").click();
        });

        verifyBreakoutExistsAndIsFirst({
          column: "Created At",
          bucket: "Week",
        });

        verifyAggregations([
          {
            name: "Count (2 weeks ago)",
            expression: "Offset(Count, -2)",
          },
          {
            name: "Count (% vs 2 weeks ago)",
            expression: "Count / Offset(Count, -2) - 1",
          },
        ]);
      });

      describe("single aggregation", () => {
        it("no breakout", () => {
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_NO_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);
          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At: Month");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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

        it("breakout on non-binned datetime column", () => {
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At: Day");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Category");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);

          H.openNotebook();

          cy.button("Summarize").click();
          verifyNoColumnCompareShortcut();
          cy.realPress("Escape");

          cy.button(/Visualization/).click();
          H.queryBuilderMain().findByText("42").should("be.visible");

          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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

        it("breakout on temporal column which is an expression", () => {
          H.createQuestion(
            { query: QUERY_TEMPORAL_EXPRESSION_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At plus one month: Month");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
            column: "Created At plus one month",
            bucket: "Month",
          });

          verifyColumns([
            "Count (previous month)",
            "Count (vs previous month)",
            "Count (% vs previous month)",
          ]);
        });

        it("multiple breakouts", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_BREAKOUTS },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
          breakout({ column: "Category" }).should("exist");

          verifyColumns([
            "Count (previous month)",
            "Count (vs previous month)",
            "Count (% vs previous month)",
          ]);
        });

        it("multiple temporal breakouts", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_TEMPORAL_BREAKOUTS },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
          breakout({ column: "Category" }).should("exist");
          breakout({ column: "Created At" }).should("exist");

          verifyColumns([
            "Count (previous month)",
            "Count (vs previous month)",
            "Count (% vs previous month)",
          ]);
        });

        it("one breakout on non-default datetime column", () => {
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_OTHER_DATETIME },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Count");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
          breakout({ column: "Created At", bucket: "Month" }).should(
            "not.exist",
          );

          verifyColumns([
            "Count (previous month)",
            "Count (vs previous month)",
            "Count (% vs previous month)",
          ]);
        });
      });

      describe("multiple aggregations", () => {
        it("no breakout", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_AGGREGATIONS_NO_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step1Title: "Compare one of these to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);
          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
          H.createQuestion(
            { query: QUERY_MULTIPLE_AGGREGATIONS_BINNED_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step1Title: "Compare one of these to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At: Month");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(_.omit(info, "step1Title"));
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
          H.createQuestion(
            { query: QUERY_MULTIPLE_AGGREGATIONS_NON_BINNED_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step1Title: "Compare one of these to the past",
            step2Title: "Compare “Count” to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At: Day");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(_.omit(info, "step1Title"));
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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
          H.createQuestion(
            { query: QUERY_MULTIPLE_AGGREGATIONS_NON_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            step1Title: "Compare one of these to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "ago",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Category");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(_.omit(info, "step1Title"));
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
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

    describe("moving average", () => {
      it("should be possible to change the temporal bucket with a custom offset", () => {
        H.createQuestion(
          { query: QUERY_SINGLE_AGGREGATION_NO_BREAKOUT },
          { visitQuestion: true, wrapId: true, idAlias: "questionId" },
        );

        H.openNotebook();
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.getNotebookStep("summarize")
          .findAllByTestId("aggregate-step")
          .last()
          .icon("add")
          .click();

        H.popover().within(() => {
          cy.findByText("Basic functions").click();
          cy.findByText("Compare to the past").click();

          cy.findByText("Moving average").click();

          cy.findByLabelText("Offset").clear().type("3");
          cy.findByLabelText("Unit").click();
        });

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.popover().last().findByText("Week").click();

        H.popover().within(() => {
          cy.findByText("Done").click();
        });

        verifyBreakoutExistsAndIsFirst({
          column: "Created At",
          bucket: "Week",
        });

        verifyAggregations([
          {
            name: "Count (3-week moving average)",
            expression:
              "(Offset(Count, -1) + Offset(Count, -2) + Offset(Count, -3)) / 3",
          },
          {
            name: "Count (% vs 3-week moving average)",
            expression:
              "Count / ((Offset(Count, -1) + Offset(Count, -2) + Offset(Count, -3)) / 3)",
          },
        ]);
      });

      describe("single aggregation", () => {
        it("no breakout", () => {
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_NO_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);
          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
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
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });

        it("breakout on binned datetime column", () => {
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At: Month");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyBreakoutExistsAndIsFirst({
            column: "Created At",
            bucket: "Month",
          });

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });

        it("breakout on non-binned datetime column", () => {
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At: Day");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-period moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-period moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-period moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyBreakoutExistsAndIsFirst({
            column: "Created At",
          });

          verifyColumns([
            "Count (2-period moving average)",
            "Count (vs 2-period moving average)",
            "Count (% vs 2-period moving average)",
          ]);
        });

        it("breakout on non-datetime column", () => {
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Category");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);

          H.openNotebook();

          cy.button(/Summarize/).click();
          verifyNoColumnCompareShortcut();
          cy.realPress("Escape");

          cy.button(/Visualization/).click();
          H.queryBuilderMain().findByText("42").should("be.visible");

          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyBreakoutExistsAndIsFirst({
            column: "Created At",
            bucket: "Month",
          });

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });

        it("multiple breakouts", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_BREAKOUTS },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyBreakoutExistsAndIsFirst({
            column: "Created At",
            bucket: "Month",
          });
          breakout({ column: "Category" }).should("exist");

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });

        it("multiple temporal breakouts", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_TEMPORAL_BREAKOUTS },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyBreakoutExistsAndIsFirst({
            column: "Created At",
            bucket: "Month",
          });
          breakout({ column: "Category" }).should("exist");

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });

        it("one breakout on non-default datetime column", () => {
          H.createQuestion(
            { query: QUERY_SINGLE_AGGREGATION_OTHER_DATETIME },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Count");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyBreakoutExistsAndIsFirst({
            column: "User → Created At",
            bucket: "Month",
          });
          breakout({ column: "Created At", bucket: "Month" }).should(
            "not.exist",
          );

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });
      });

      describe("multiple aggregations", () => {
        it("no breakout", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_AGGREGATIONS_NO_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step1Title: "Compare one of these to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);
          verifyColumnDrillText(info);
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
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
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });

        it("breakout on binned datetime column", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_AGGREGATIONS_BINNED_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step1Title: "Compare one of these to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At: Month");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(_.omit(info, "step1Title"));
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });

        it("breakout on non-binned datetime column", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_AGGREGATIONS_NON_BINNED_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step1Title: "Compare one of these to the past",
            step2Title: "Compare “Count” to the past",
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Created At: Day");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(_.omit(info, "step1Title"));
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-period moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-period moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-period moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyColumns([
            "Count (2-period moving average)",
            "Count (vs 2-period moving average)",
            "Count (% vs 2-period moving average)",
          ]);
        });

        it("breakout on non-datetime column", () => {
          H.createQuestion(
            { query: QUERY_MULTIPLE_AGGREGATIONS_NON_DATETIME_BREAKOUT },
            { visitQuestion: true, wrapId: true, idAlias: "questionId" },
          );

          const info = {
            type: "moving-average" as const,
            itemName: "Compare to the past",
            step2Title: "Compare “Count” to the past",
            step1Title: "Compare one of these to the past",
            presets: ["Previous month", "Previous year"],
            offsetHelp: "moving average",
          };

          verifySummarizeText(info);

          H.tableHeaderClick("Category");
          verifyNoColumnCompareShortcut();

          verifyColumnDrillText(_.omit(info, "step1Title"));
          verifyPlusButtonText(info);
          verifyNotebookText(info);

          toggleColumnPickerItems(["Value difference"]);
          H.popover().button("Done").click();

          cy.get("@questionId").then((questionId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "column_compare_via_shortcut",
              custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
              database_id: SAMPLE_DB_ID,
              question_id: questionId,
            });
          });

          verifyAggregations([
            {
              name: "Count (2-month moving average)",
              expression: "(Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (vs 2-month moving average)",
              expression: "Count - (Offset(Count, -1) + Offset(Count, -2)) / 2",
            },
            {
              name: "Count (% vs 2-month moving average)",
              expression:
                "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
            },
          ]);

          verifyColumns([
            "Count (2-month moving average)",
            "Count (vs 2-month moving average)",
            "Count (% vs 2-month moving average)",
          ]);
        });
      });
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
  H.popover()
    .findByText(/compare/)
    .should("not.exist");
}

type CheckTextOpts = {
  itemName: string;
  type?: "moving-average" | "offset";
  step1Title?: string;
  step2Title: string;
  offsetHelp: string;
  presets?: string[];
  includePeriodText?: string;
};

function verifyPresets(presets: string[] = []) {
  for (const preset of presets) {
    cy.findByText(preset).should("be.visible");
  }
}

function selectCustomOffset() {
  // This is broken up because the dashboard sometimes rerenders while clicking
  // Cypress recommends this as a workaround for flakyness.
  cy.findByText("Custom...").as("btn").should("be.visible");
  cy.get("@btn").click();
}

function verifySummarizeText(options: CheckTextOpts) {
  cy.button(/Summarize/).click();
  H.rightSidebar().button("Add aggregation").click();

  H.popover().within(() => {
    cy.findByText(options.itemName).should("be.visible").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("be.visible");
      cy.findByText("Sum of Price").should("be.visible");
      cy.findByText("Count").click();
    }

    if (options.type === "moving-average") {
      cy.findByText("Moving average").click();
      if (options.includePeriodText) {
        cy.findByText(options.includePeriodText).should("be.visible");
      }
    } else {
      verifyPresets(options.presets);
      selectCustomOffset();
    }

    cy.findByText(options.step2Title).should("be.visible");
    cy.findByText(options.offsetHelp).should("be.visible");
  });
}

function verifyColumnDrillText(options: Omit<CheckTextOpts, "step1Title">) {
  H.tableHeaderClick("Count");

  H.popover().within(() => {
    cy.findByText(options.itemName).should("be.visible").click();
    cy.findByText(options.step2Title).should("be.visible");

    if (options.type === "moving-average") {
      cy.findByText("Moving average").click();
      if (options.includePeriodText) {
        cy.findByText(options.includePeriodText).should("be.visible");
      }
    } else {
      verifyPresets(options.presets);
      selectCustomOffset();
    }

    cy.findByText(options.offsetHelp).should("be.visible");
  });
}

function verifyPlusButtonText(options: CheckTextOpts) {
  cy.button("Add column").click();

  H.popover().within(() => {
    cy.findByText(options.itemName).should("be.visible").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("be.visible");
      cy.findByText("Sum of Price").should("be.visible");
      cy.findByText("Count").click();
    }

    if (options.type === "moving-average") {
      cy.findByText("Moving average").click();
      if (options.includePeriodText) {
        cy.findByText(options.includePeriodText).should("be.visible");
      }
    } else {
      verifyPresets(options.presets);
      selectCustomOffset();
    }

    cy.findByText(options.step2Title).should("be.visible");
    cy.findByText(options.offsetHelp).should("be.visible");
  });
}

function verifyNotebookText(options: CheckTextOpts) {
  H.openNotebook();
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.getNotebookStep("summarize")
    .findAllByTestId("aggregate-step")
    .last()
    .icon("add")
    .click();

  H.popover().within(() => {
    cy.findByText("Basic functions").click();
    cy.findByText(options.itemName).should("be.visible").click();

    if (options.step1Title) {
      cy.findByText(options.step1Title).should("be.visible");
      cy.findByText("Sum of Price").should("be.visible");
      cy.findByText("Count").should("be.visible").click();
    }

    if (options.type === "moving-average") {
      cy.findByText("Moving average").click();
      if (options.includePeriodText) {
        cy.findByText(options.includePeriodText).should("be.visible");
      }
    } else {
      verifyPresets(options.presets);
      selectCustomOffset();
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
      .should("be.visible")
      .click();

    cy.get(".ace_content").should("have.text", result.expression);

    cy.realPress("Escape");
  }
}

function verifyColumns(names: string[]) {
  H.visualize();

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
