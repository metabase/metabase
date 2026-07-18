/**
 * Playwright port of e2e/test/scenarios/question/column-compare.cy.spec.ts
 *
 * IMPORTANT: the upstream describe is tagged `@skip`
 * ("TODO: reenable test when we reenable the 'Compare to the past'
 * components.") — the feature these tests exercise is disabled in the product.
 * The whole suite is therefore a `test.describe.skip`, preserving the upstream
 * skip. Because the feature is off, the runtime behaviour of the ported tests
 * is unverifiable here (see findings-inbox/column-compare.md); the port is a
 * faithful structural translation for when the feature — and the upstream
 * skip — are lifted.
 *
 * Snowplow helpers are no-op stubs (no snowplow-micro container in the spike
 * harness) — rule 6, same pattern as cc-shortcuts / metrics-question.
 *
 * `cy.get("@questionId")` alias + wrapId/idAlias → capture the id from the API
 * create call directly. `_.omit(info, "step1Title")` is dropped: the drill-text
 * helper never reads step1Title, so passing the full `info` is behaviourally
 * identical (verifyColumnDrillText's param is typed to exclude it).
 */
import {
  type CheckTextOpts,
  breakout,
  toggleColumnPickerItems,
  verifyAggregations,
  verifyBreakoutExistsAndIsFirst,
  verifyColumnDrillText,
  verifyColumns,
  verifyNoColumnCompareShortcut,
  verifyNotebookText,
  verifyPlusButtonText,
  verifySummarizeText,
} from "../support/column-compare";
import { type MetabaseApi } from "../support/api";
import { icon } from "../support/dashboard-cards";
import { expect, test } from "../support/fixtures";
import {
  openNotebook,
  queryBuilderMain,
  tableHeaderClick,
} from "../support/notebook";
import { rightSidebar } from "../support/question-saved";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { popover } from "../support/ui";
import { visitQuestion } from "../support/ui";
import type { Page } from "@playwright/test";

const { PRODUCTS_ID, PRODUCTS, ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

// Minimal local aliases (metabase-types/api is outside the spike tsconfig).
type FieldReference = ["field", number, Record<string, unknown>];
type StructuredQuery = Record<string, unknown>;

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

// TODO (rule 6): no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

async function createAndVisitQuestion(
  page: Page,
  api: MetabaseApi,
  query: StructuredQuery,
): Promise<number> {
  const { id } = await api.createQuestion({ query });
  await visitQuestion(page, id);
  return id;
}

// TODO: reenable test when we reenable the "Compare to the past" components.
test.describe.skip("scenarios > question > column compare", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsAdmin();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test.describe("no aggregations", () => {
    test("does not show column compare shortcut", async ({ page, mb }) => {
      await createAndVisitQuestion(page, mb.api, QUERY_NO_AGGREGATION);

      // chill mode - summarize sidebar
      await page.getByRole("button", { name: /Summarize/ }).click();
      await icon(
        rightSidebar(page).getByRole("button", { name: "Count", exact: true }),
        "close",
      ).click();
      await rightSidebar(page)
        .getByRole("button", { name: "Add aggregation", exact: true })
        .click();
      await verifyNoColumnCompareShortcut(page);

      // chill mode - column drill
      await tableHeaderClick(page, "Title");
      await verifyNoColumnCompareShortcut(page);

      // chill mode - plus button
      await page.getByRole("button", { name: "Add column", exact: true }).click();
      await verifyNoColumnCompareShortcut(page);

      // notebook editor
      await openNotebook(page);
      await page.getByRole("button", { name: /Summarize/ }).click();
      await verifyNoColumnCompareShortcut(page);
    });
  });

  test.describe("no temporal columns", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.api.put(`/api/field/${PRODUCTS.CREATED_AT}`, {
        base_type: "type/Text",
      });
    });

    test("no breakout", async ({ page, mb }) => {
      await createAndVisitQuestion(page, mb.api, QUERY_NO_AGGREGATION);

      // chill mode - summarize sidebar
      await page.getByRole("button", { name: /Summarize/ }).click();
      await icon(
        rightSidebar(page).getByRole("button", { name: "Count", exact: true }),
        "close",
      ).click();
      await rightSidebar(page)
        .getByRole("button", { name: "Add aggregation", exact: true })
        .click();
      await verifyNoColumnCompareShortcut(page);

      // chill mode - column drill
      await tableHeaderClick(page, "Title");
      await verifyNoColumnCompareShortcut(page);

      // chill mode - plus button
      await page.getByRole("button", { name: "Add column", exact: true }).click();
      await verifyNoColumnCompareShortcut(page);

      // notebook editor
      await openNotebook(page);
      await page.getByRole("button", { name: "Summarize", exact: true }).click();
      await verifyNoColumnCompareShortcut(page);
    });

    test("one breakout", async ({ page, mb }) => {
      await createAndVisitQuestion(
        page,
        mb.api,
        QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT,
      );

      // chill mode - summarize sidebar
      await page.getByRole("button", { name: /Summarize/ }).click();
      await icon(
        rightSidebar(page).getByRole("button", { name: "Count", exact: true }),
        "close",
      ).click();
      await rightSidebar(page)
        .getByRole("button", { name: "Add aggregation", exact: true })
        .click();
      await verifyNoColumnCompareShortcut(page);

      // chill mode - column drill
      await tableHeaderClick(page, "Category");
      await verifyNoColumnCompareShortcut(page);

      // chill mode - plus button
      await page.getByRole("button", { name: "Add column", exact: true }).click();
      await verifyNoColumnCompareShortcut(page);

      // notebook editor
      await openNotebook(page);
      await page.getByRole("button", { name: "Summarize", exact: true }).click();
      await verifyNoColumnCompareShortcut(page);
    });
  });

  test.describe("offset", () => {
    test("should be possible to change the temporal bucket through a preset", async ({
      page,
      mb,
    }) => {
      await createAndVisitQuestion(
        page,
        mb.api,
        QUERY_SINGLE_AGGREGATION_NO_BREAKOUT,
      );

      await openNotebook(page);
      await getSummarizeAddButton(page).click();

      const pop = popover(page);
      await pop.getByText("Basic functions", { exact: true }).click();
      await pop.getByText("Compare to the past", { exact: true }).click();
      await pop.getByText("Previous year", { exact: true }).click();
      await pop.getByText("Done", { exact: true }).click();

      await verifyBreakoutExistsAndIsFirst(page, {
        column: "Created At",
        bucket: "Year",
      });

      await verifyAggregations(page, [
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

    test("should be possible to change the temporal bucket with a custom offset", async ({
      page,
      mb,
    }) => {
      await createAndVisitQuestion(
        page,
        mb.api,
        QUERY_SINGLE_AGGREGATION_NO_BREAKOUT,
      );

      await openNotebook(page);
      await getSummarizeAddButton(page).click();

      const pop = popover(page);
      await pop.getByText("Basic functions", { exact: true }).click();
      await pop.getByText("Compare to the past", { exact: true }).click();
      await pop.getByText("Custom...", { exact: true }).click();
      await pop.getByLabel("Offset").clear();
      await pop.getByLabel("Offset").fill("2");
      await pop.getByLabel("Unit").click();

      // eslint-disable-next-line -- H.popover().last()
      await popover(page).last().getByText("Weeks", { exact: true }).click();

      await popover(page).getByText("Done", { exact: true }).click();

      await verifyBreakoutExistsAndIsFirst(page, {
        column: "Created At",
        bucket: "Week",
      });

      await verifyAggregations(page, [
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

    test.describe("single aggregation", () => {
      test("no breakout", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_NO_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);
        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });

        await verifyAggregations(page, [
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

      test("breakout on binned datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At: Month");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });

        await verifyColumns(page, [
          "Count (previous month)",
          "Count (vs previous month)",
          "Count (% vs previous month)",
        ]);
      });

      test("breakout on non-binned datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At: Day");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyColumns(page, [
          "Count (previous period)",
          "Count (vs previous period)",
          "Count (% vs previous period)",
        ]);
      });

      test("breakout on non-datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Category");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);

        await openNotebook(page);

        await page.getByRole("button", { name: "Summarize", exact: true }).click();
        await verifyNoColumnCompareShortcut(page);
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: /Visualization/ }).click();
        await expect(
          queryBuilderMain(page).getByText("42", { exact: true }),
        ).toBeVisible();

        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });

        await verifyColumns(page, [
          "Count (previous month)",
          "Count (vs previous month)",
          "Count (% vs previous month)",
        ]);
      });

      test("breakout on temporal column which is an expression", async ({
        page,
        mb,
      }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_TEMPORAL_EXPRESSION_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At plus one month: Month");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At plus one month",
          bucket: "Month",
        });

        await verifyColumns(page, [
          "Count (previous month)",
          "Count (vs previous month)",
          "Count (% vs previous month)",
        ]);
      });

      test("multiple breakouts", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_BREAKOUTS,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });
        await expect(breakout(page, { column: "Category" })).toBeAttached();

        await verifyColumns(page, [
          "Count (previous month)",
          "Count (vs previous month)",
          "Count (% vs previous month)",
        ]);
      });

      test("multiple temporal breakouts", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_TEMPORAL_BREAKOUTS,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });
        await expect(breakout(page, { column: "Category" })).toBeAttached();
        await expect(breakout(page, { column: "Created At" })).toBeAttached();

        await verifyColumns(page, [
          "Count (previous month)",
          "Count (vs previous month)",
          "Count (% vs previous month)",
        ]);
      });

      test("one breakout on non-default datetime column", async ({
        page,
        mb,
      }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_OTHER_DATETIME,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Count");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "User → Created At",
          bucket: "Month",
        });
        await expect(
          breakout(page, { column: "Created At", bucket: "Month" }),
        ).toHaveCount(0);

        await verifyColumns(page, [
          "Count (previous month)",
          "Count (vs previous month)",
          "Count (% vs previous month)",
        ]);
      });
    });

    test.describe("multiple aggregations", () => {
      test("no breakout", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_AGGREGATIONS_NO_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step1Title: "Compare one of these to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);
        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });
        await verifyAggregations(page, [
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

      test("breakout on binned datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_AGGREGATIONS_BINNED_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step1Title: "Compare one of these to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At: Month");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyColumns(page, [
          "Count (previous month)",
          "Count (vs previous month)",
          "Count (% vs previous month)",
        ]);
      });

      test("breakout on non-binned datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_AGGREGATIONS_NON_BINNED_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step1Title: "Compare one of these to the past",
          step2Title: "Compare “Count” to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At: Day");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyColumns(page, [
          "Count (previous period)",
          "Count (vs previous period)",
          "Count (% vs previous period)",
        ]);
      });

      test("breakout on non-datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_AGGREGATIONS_NON_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          step1Title: "Compare one of these to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "ago",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Category");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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

        await verifyColumns(page, [
          "Count (previous month)",
          "Count (vs previous month)",
          "Count (% vs previous month)",
        ]);
      });
    });
  });

  test.describe("moving average", () => {
    test("should be possible to change the temporal bucket with a custom offset", async ({
      page,
      mb,
    }) => {
      await createAndVisitQuestion(
        page,
        mb.api,
        QUERY_SINGLE_AGGREGATION_NO_BREAKOUT,
      );

      await openNotebook(page);
      await getSummarizeAddButton(page).click();

      const pop = popover(page);
      await pop.getByText("Basic functions", { exact: true }).click();
      await pop.getByText("Compare to the past", { exact: true }).click();
      await pop.getByText("Moving average", { exact: true }).click();
      await pop.getByLabel("Offset").clear();
      await pop.getByLabel("Offset").fill("3");
      await pop.getByLabel("Unit").click();

      // eslint-disable-next-line -- H.popover().last()
      await popover(page).last().getByText("Week", { exact: true }).click();

      await popover(page).getByText("Done", { exact: true }).click();

      await verifyBreakoutExistsAndIsFirst(page, {
        column: "Created At",
        bucket: "Week",
      });

      await verifyAggregations(page, [
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

    test.describe("single aggregation", () => {
      test("no breakout", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_NO_BREAKOUT,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);
        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });

      test("breakout on binned datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_BINNED_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At: Month");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });

      test("breakout on non-binned datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_NON_BINNED_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At: Day");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
        });

        await verifyColumns(page, [
          "Count (2-period moving average)",
          "Count (vs 2-period moving average)",
          "Count (% vs 2-period moving average)",
        ]);
      });

      test("breakout on non-datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_NON_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Category");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);

        await openNotebook(page);

        await page.getByRole("button", { name: /Summarize/ }).click();
        await verifyNoColumnCompareShortcut(page);
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: /Visualization/ }).click();
        await expect(
          queryBuilderMain(page).getByText("42", { exact: true }),
        ).toBeVisible();

        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });

      test("multiple breakouts", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_BREAKOUTS,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });
        await expect(breakout(page, { column: "Category" })).toBeAttached();

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });

      test("multiple temporal breakouts", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_TEMPORAL_BREAKOUTS,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });
        await expect(breakout(page, { column: "Category" })).toBeAttached();

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });

      test("one breakout on non-default datetime column", async ({
        page,
        mb,
      }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_SINGLE_AGGREGATION_OTHER_DATETIME,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Count");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "User → Created At",
          bucket: "Month",
        });
        await expect(
          breakout(page, { column: "Created At", bucket: "Month" }),
        ).toHaveCount(0);

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });
    });

    test.describe("multiple aggregations", () => {
      test("no breakout", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_AGGREGATIONS_NO_BREAKOUT,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step1Title: "Compare one of these to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);
        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyBreakoutExistsAndIsFirst(page, {
          column: "Created At",
          bucket: "Month",
        });
        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });

      test("breakout on binned datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_AGGREGATIONS_BINNED_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step1Title: "Compare one of these to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At: Month");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });

      test("breakout on non-binned datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_AGGREGATIONS_NON_BINNED_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step1Title: "Compare one of these to the past",
          step2Title: "Compare “Count” to the past",
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Created At: Day");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyColumns(page, [
          "Count (2-period moving average)",
          "Count (vs 2-period moving average)",
          "Count (% vs 2-period moving average)",
        ]);
      });

      test("breakout on non-datetime column", async ({ page, mb }) => {
        const questionId = await createAndVisitQuestion(
          page,
          mb.api,
          QUERY_MULTIPLE_AGGREGATIONS_NON_DATETIME_BREAKOUT,
        );

        const info: CheckTextOpts = {
          type: "moving-average",
          itemName: "Compare to the past",
          step2Title: "Compare “Count” to the past",
          step1Title: "Compare one of these to the past",
          presets: ["Previous month", "Previous year"],
          offsetHelp: "moving average",
        };

        await verifySummarizeText(page, info);

        await tableHeaderClick(page, "Category");
        await verifyNoColumnCompareShortcut(page);

        await verifyColumnDrillText(page, info);
        await verifyPlusButtonText(page, info);
        await verifyNotebookText(page, info);

        await toggleColumnPickerItems(page, ["Value difference"]);
        await popover(page).getByRole("button", { name: "Done", exact: true }).click();

        await expectUnstructuredSnowplowEvent({
          event: "column_compare_via_shortcut",
          custom_expressions_used: CUSTOM_EXPRESSIONS_USED_MOVING_AVERAGE,
          database_id: SAMPLE_DB_ID,
          question_id: questionId,
        });

        await verifyAggregations(page, [
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
            expression: "Count / ((Offset(Count, -1) + Offset(Count, -2)) / 2)",
          },
        ]);

        await verifyColumns(page, [
          "Count (2-month moving average)",
          "Count (vs 2-month moving average)",
          "Count (% vs 2-month moving average)",
        ]);
      });
    });
  });
});

/**
 * H.getNotebookStep("summarize").findAllByTestId("aggregate-step").last()
 *   .icon("add") — the "add another aggregation" plus button.
 */
function getSummarizeAddButton(page: Page) {
  return page
    .getByTestId("step-summarize-0-0")
    .getByTestId("aggregate-step")
    .last()
    .locator(".Icon-add");
}
