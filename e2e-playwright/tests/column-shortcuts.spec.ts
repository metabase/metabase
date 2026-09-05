/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/column-shortcuts.cy.spec.ts
 *
 * Table-header "Add column" shortcuts: Extract part of column and Combine
 * columns, driven from the table's "+" (Add column) button.
 *
 * Notes:
 * - Snowplow helpers (resetSnowplow / expectNoBadSnowplowEvents /
 *   expectUnstructuredSnowplowEvent) run real assertions, backed by the per-slot
 *   collector via ../support/snowplow. The tests exercise the full UI and assert
 *   the events for real.
 * - H.createQuestion(details, { visitQuestion: true }) → api.createQuestion +
 *   visitQuestion(page, id).
 * - cy.wait("@dataset") pairs are handled inside the extract/combine helpers
 *   (register a page.waitForResponse before the trigger).
 * - The scroll-behaviour test's `should("be.visible")` on the ID column header
 *   is ported as toBeInViewport(): the test verifies the table did NOT
 *   auto-scroll the new column into view, i.e. that ID stays on screen — and
 *   Playwright's toBeVisible ignores overflow-clipping (PORTING.md), so it
 *   would not catch a regression that scrolled ID away.
 */
import {
  combineColumns,
  extractColumnAndCheck,
  openOrdersTable,
} from "../support/column-shortcuts";
import { test, expect } from "../support/fixtures";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  visualize,
} from "../support/notebook";
import { tableInteractive } from "../support/models";
import { tableInteractiveScrollContainer } from "../support/table-column-settings";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { caseSensitiveSubstring } from "../support/text";
import { popover, visitQuestion } from "../support/ui";

const { PEOPLE, PEOPLE_ID, ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const DATE_CASES = [
  { option: "Hour of day", value: "21", example: "0, 1", expressions: ["get-hour"] },
  { option: "Day of month", value: "11", example: "1, 2", expressions: ["get-day"] },
  {
    option: "Day of week",
    value: "Friday",
    example: "Monday, Tuesday",
    expressions: ["day-name", "get-day-of-week"],
  },
  {
    option: "Month of year",
    value: "Feb",
    example: "Jan, Feb",
    expressions: ["month-name", "get-month"],
  },
  {
    option: "Quarter of year",
    value: "Q1",
    example: "Q1, Q2",
    expressions: ["quarter-name", "get-quarter"],
  },
  { option: "Year", value: "2,028", example: "2026, 2027", expressions: ["get-year"] },
];

const EMAIL_CASES = [
  { option: "Domain", value: "yahoo", example: "example, online", expressions: ["domain"] },
  {
    option: "Host",
    value: "yahoo.com",
    example: "example.com, online.com",
    expressions: ["host"],
  },
];

const URL_CASES = [
  { option: "Domain", value: "yahoo", example: "example, online", expressions: ["domain"] },
  { option: "Subdomain", value: "", example: "www, maps", expressions: ["subdomain"] },
  {
    option: "Host",
    value: "yahoo.com",
    example: "example.com, online.com",
    expressions: ["host"],
  },
];

test.describe("extract shortcut", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test.describe("date columns", () => {
    test.describe("should add a date expression for each option", () => {
      for (const { option, value, example, expressions } of DATE_CASES) {
        test(option, async ({ mb, page }) => {
          await openOrdersTable(page, { limit: 1 });
          await extractColumnAndCheck(page, {
            column: "Created At",
            option,
            value,
            example,
          });
          await expectUnstructuredSnowplowEvent(mb, {
            event: "column_extract_via_plus_modal",
            custom_expressions_used: expressions,
            database_id: SAMPLE_DB_ID,
          });
        });
      }
    });

    test("should handle duplicate expression names", async ({ page }) => {
      await openOrdersTable(page, { limit: 1 });
      await extractColumnAndCheck(page, {
        column: "Created At",
        option: "Hour of day",
        newColumn: "Hour of day",
      });
      await extractColumnAndCheck(page, {
        column: "Created At",
        option: "Hour of day",
        newColumn: "Hour of day_2",
      });
    });

    test("should be able to modify the expression in the notebook editor", async ({
      page,
    }) => {
      await openOrdersTable(page, { limit: 1 });
      await extractColumnAndCheck(page, {
        column: "Created At",
        option: "Year",
        value: "2,028",
      });
      await openNotebook(page);
      await getNotebookStep(page, "expression")
        .getByText("Year", { exact: true })
        .click();
      await enterCustomColumnDetails(page, {
        name: "custom formula",
        formula: "year([Created At]) + 2",
        blur: true,
      });
      const update = popover(page).getByRole("button", {
        name: "Update",
        exact: true,
      });
      await expect(update).toBeEnabled();
      await update.click();
      await visualize(page);
      await expect(
        page.getByRole("gridcell", { name: "2,030", exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("email columns", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    for (const { option, value, example, expressions } of EMAIL_CASES) {
      test(option, async ({ page, mb }) => {
        const { id } = await mb.api.createQuestion({
          query: {
            "source-table": PEOPLE_ID,
            limit: 1,
          },
        });
        await visitQuestion(page, id);

        await extractColumnAndCheck(page, {
          column: "Email",
          option,
          value,
          example,
        });
        await expectUnstructuredSnowplowEvent(mb, {
          event: "column_extract_via_plus_modal",
          custom_expressions_used: expressions,
          database_id: SAMPLE_DB_ID,
        });
      });
    }
  });

  test.describe("url columns", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      // Make the Email column a URL column for these tests, to avoid having to
      // create a new model.
      await mb.api.put(`/api/field/${PEOPLE.EMAIL}`, {
        semantic_type: "type/URL",
      });
    });

    for (const { option, value, example, expressions } of URL_CASES) {
      test(option, async ({ page, mb }) => {
        const { id } = await mb.api.createQuestion({
          query: {
            "source-table": PEOPLE_ID,
            limit: 1,
          },
        });
        await visitQuestion(page, id);

        await extractColumnAndCheck(page, {
          column: "Email",
          option,
          value,
          example,
        });
        await expectUnstructuredSnowplowEvent(mb, {
          event: "column_extract_via_plus_modal",
          custom_expressions_used: expressions,
          database_id: SAMPLE_DB_ID,
        });
      });
    }
  });

  test("should disable the scroll behaviour after it has been rendered", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      query: {
        "source-table": PEOPLE_ID,
        limit: 1,
      },
    });
    await visitQuestion(page, id);

    await extractColumnAndCheck(page, {
      column: "Email",
      option: "Host",
    });

    // H.tableInteractiveScrollContainer().scrollTo("left", { duration }) — a
    // jQuery scroll animation to x=0. Assign scrollLeft directly (reducedMotion
    // skips programmatic smooth scroll — PORTING.md); the ~33ms duration is
    // immaterial to what the test asserts.
    await tableInteractiveScrollContainer(page).evaluate((el) => {
      el.scrollLeft = 0;
    });

    await page
      .getByRole("columnheader")
      .filter({ hasText: caseSensitiveSubstring("ID") })
      .first()
      .click();

    // Change sort direction.
    await popover(page).getByRole("button").first().click();

    // ID should still be visible (ie. no scrolling to the end should have
    // happened). toBeInViewport, not toBeVisible: the mechanism is
    // overflow-scrolling, which toBeVisible ignores (PORTING.md).
    await expect(
      page
        .getByRole("columnheader")
        .filter({ hasText: caseSensitiveSubstring("ID") })
        .first(),
    ).toBeInViewport();
  });

  test("should be possible to extract columns from a summarized table", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      query: {
        "source-table": ORDERS_ID,
        limit: 1,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    });
    await visitQuestion(page, id);

    await extractColumnAndCheck(page, {
      column: "Created At: Month",
      option: "Month of year",
    });

    await expect(
      page.getByRole("columnheader", { name: "Month of year", exact: true }),
    ).toBeVisible();
  });

  test("should be possible to extract columns from table with breakouts", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    });
    await visitQuestion(page, id);

    await extractColumnAndCheck(page, {
      column: "Created At: Month",
      option: "Month of year",
    });

    await expect(
      page.getByRole("columnheader", { name: "Month of year", exact: true }),
    ).toBeVisible();
  });
});

test.describe("scenarios > visualizations > combine shortcut", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await resetSnowplow(mb);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should be possible add a new column through the combine columns shortcut", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      query: {
        "source-table": PEOPLE_ID,
        limit: 1,
        fields: [
          ["field", PEOPLE.ID, null],
          ["field", PEOPLE.EMAIL, null],
        ],
      },
    });
    await visitQuestion(page, id);

    await combineColumns(page, {
      columns: ["Email", "ID"],
      newColumn: "Combined Email, ID",
      example: "email@example.com12345",
      newValue: "borer-hudson@yahoo.com1",
    });

    await expectUnstructuredSnowplowEvent(mb, {
      event: "column_combine_via_plus_modal",
      custom_expressions_used: ["concat"],
      database_id: SAMPLE_DB_ID,
    });
  });

  test("should allow combining columns when aggregating", async ({ page, mb }) => {
    const { id } = await mb.api.createQuestion({
      query: {
        "source-table": ORDERS_ID,
        limit: 1,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
        ],
      },
    });
    await visitQuestion(page, id);

    await expect(tableInteractive(page)).toBeAttached();
    await combineColumns(page, {
      columns: ["Created At: Hour of day", "Count"],
      newColumn: "Combined Created At: Hour of day, Count",
      example: "2042-01-01 12:34:56.789 123",
      newValue: "0 766",
    });
  });

  test("should allow combining columns on a table with just breakouts", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      query: {
        "source-table": ORDERS_ID,
        limit: 1,
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
        ],
      },
    });
    await visitQuestion(page, id);

    await expect(tableInteractive(page)).toBeAttached();
    await combineColumns(page, {
      columns: ["Created At: Hour of day", "Product → Category"],
      newColumn: "Combined Created At: Hour of day, Product → Category",
      example: "2042-01-01 12:34:56.789 text",
      newValue: "0 Doohickey",
    });
  });
});
