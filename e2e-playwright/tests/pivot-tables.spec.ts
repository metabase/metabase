/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js
 *
 * Porting notes:
 * - The Cypress beforeEach `cy.intercept("POST","/api/card").as("createCard")`
 *   is never awaited anywhere in the file, so it's dropped (rule 2).
 * - `cy.findByText("literal")` is an exact testing-library match → getByText(…,
 *   { exact: true }); regex arguments are kept as regexes.
 * - `cy.contains(text)` (case-sensitive substring, first match) → getByText
 *   substring + `.first()`.
 * - `H.visitQuestionAdhoc` sets up the `@pivotDataset` / `@dataset` alias that
 *   later `cy.wait`s consume; those are re-registered as waitForResponse at the
 *   true trigger here.
 * - Horizontal-scroll reveal (`scrollTo(10000,0)` then `should("be.visible")`)
 *   is ported as scrollLeft + a dispatched scroll event, asserted with
 *   `toBeInViewport` — Playwright's toBeVisible ignores scroll clipping.
 * - The native-query error test navigates the ad-hoc hash directly (the shared
 *   visitQuestionAdhoc helper refuses native+autorun, and the pivot error
 *   renders without running anything).
 */
import type { FrameLocator, Page } from "@playwright/test";

import { leftSidebar, openVizSettingsSidebar } from "../support/charts";
import {
  openVizTypeSidebar,
  visitNativeQuestionAdhoc,
} from "../support/charts-extras";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  modal,
  saveDashboard,
} from "../support/dashboard";
import { icon, showDashboardCardActions } from "../support/dashboard-cards";
import {
  openLegacyStaticEmbeddingModal,
  visitIframe,
} from "../support/embedding";
import { test, expect } from "../support/fixtures";
import { getNotebookStep, openNotebook, queryBuilderMain } from "../support/notebook";
import {
  PIVOT_TABLE_BODY_LABEL,
  assertOnPivotFields,
  assertOnPivotSettings,
  cellContentWidth,
  createPivotQuestion,
  findDisplayValue,
  getPivotTableBodyCell,
  moveDnDKitListElement,
  moveDnDKitPointer,
  openColumnSettings,
  saveAdhocQuestion,
  sortColumnResults,
  updatePermissionsGraph,
  visitPivotAdhoc,
} from "../support/pivot-tables";
import type { MetabaseApi } from "../support/api";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { openSharingMenu } from "../support/sharing";
import { visitDashboard, visitQuestion, popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

// Mirrors USER_GROUPS.DATA_GROUP in e2e/support/cypress_data.js.
const DATA_GROUP = 6;

const QUESTION_NAME = "Cypress Pivot Table";
const DASHBOARD_NAME = "Pivot Table Dashboard";

const TEST_CASES = [
  { case: "question" as const, subject: QUESTION_NAME },
  { case: "dashboard" as const, subject: DASHBOARD_NAME },
];

const testQuery = {
  type: "query" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PEOPLE.SOURCE,
        { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
      ],
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
  database: SAMPLE_DB_ID,
};

async function createTestQuestion(
  page: Page,
  api: MetabaseApi,
  { display = "pivot", visit = true }: { display?: string; visit?: boolean } = {},
) {
  const card = await api.createQuestion({
    name: QUESTION_NAME,
    query: testQuery.query,
    display,
  });
  if (visit) {
    await visitQuestion(page, card.id);
  }
  return card;
}

/** Collapse a pivot row/column via the .Icon-dash in the header cell's parent. */
async function collapseCell(page: Page, text: string) {
  await page
    .getByText(text, { exact: true })
    .locator("xpath=..")
    .locator(".Icon-dash")
    .click();
}

/** Uncollapse via the .Icon-add in the header cell's parent. */
async function uncollapseCell(page: Page, text: string) {
  await page
    .getByText(text, { exact: true })
    .locator("xpath=..")
    .locator(".Icon-add")
    .click();
}

test.describe("scenarios > visualizations > pivot tables", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be created from an ad-hoc question", async ({ page }) => {
    await visitPivotAdhoc(page, {
      dataset_query: testQuery,
      display: "pivot",
    });

    await expect(
      page.getByText(/Count by Users? → Source and Products? → Category/),
    ).toBeVisible();

    await openVizSettingsSidebar(page);
    await assertOnPivotSettings(page);
    await assertOnPivotFields(page.getByTestId("query-visualization-root"));
  });

  test("should correctly display saved question", async ({ page, mb }) => {
    await createTestQuestion(page, mb.api);
    await assertOnPivotFields(page.getByTestId("query-visualization-root"));

    await openVizSettingsSidebar(page);
    await assertOnPivotSettings(page);
  });

  test("should not show sub-total data after a switch to other viz type", async ({
    page,
    mb,
  }) => {
    await createTestQuestion(page, mb.api);

    // Switch to "ordinary" table
    await page.getByTestId("view-footer").getByText("Visualization").click();
    const table2 = page.locator("main aside").locator(".Icon-table2");
    await expect(table2).toBeVisible();
    await table2.click();

    const appBar = page.getByTestId("app-bar");
    // "Started from " shares its element with the question link (mixed content),
    // so exact getByText — which compares the full element text — misses it.
    await expect(appBar.getByText(/Started from/)).toBeVisible();
    await expect(appBar.getByText(QUESTION_NAME, { exact: true })).toBeVisible();

    const viz = page.getByTestId("query-visualization-root");
    await expect(viz.getByText(/Users? → Source/)).toBeVisible();
    await expect(viz.getByText("783", { exact: true })).toBeVisible(); // Affiliate - Doohickey
    await expect(viz.getByText("986", { exact: true })).toBeVisible(); // Twitter - Gizmo
    await expect(viz.getByText(/Row totals/i)).toHaveCount(0);
    await expect(viz.getByText(/Grand totals/i)).toHaveCount(0);
    await expect(viz.getByText("3,520", { exact: true })).toHaveCount(0);
    await expect(viz.getByText("4,784", { exact: true })).toHaveCount(0);
    await expect(viz.getByText("18,760", { exact: true })).toHaveCount(0);
  });

  test("should allow drill through on cells", async ({ page, mb }) => {
    await createTestQuestion(page, mb.api);
    // open drill-through menu
    await page.getByText("783", { exact: true }).click();
    // drill through to orders list
    await page.getByText("See these Orders", { exact: true }).click();
    // filters are applied
    await expect(
      page.getByText("User → Source is Affiliate", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Product → Category is Doohickey", { exact: true }),
    ).toBeVisible();
    // data loads
    await expect(page.getByText("45.04", { exact: true })).toBeVisible();
  });

  test("should allow drill through on left/top header values", async ({
    page,
    mb,
  }) => {
    await createTestQuestion(page, mb.api);
    // open drill-through menu and filter to that value
    await page.getByText("Doohickey", { exact: true }).click();
    await popover(page).getByText("=", { exact: true }).click();
    // filter is applied
    await expect(
      page.getByText("Product → Category is Doohickey", { exact: true }),
    ).toBeVisible();
    // filter out affiliate as a source
    await page.getByText("Affiliate", { exact: true }).click();
    await popover(page).getByText("≠", { exact: true }).click();
    // filter is applied and value is gone from the left header
    await expect(
      page.getByText("User → Source is not Affiliate", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Affiliate", { exact: true })).toHaveCount(0);
    await expect(page.getByText("3,193", { exact: true })).toBeVisible(); // new grand total
  });

  test("should rearrange pivoted columns", async ({ page, mb }) => {
    await createTestQuestion(page, mb.api);

    await openVizSettingsSidebar(page);
    // Give the side-bar time to open fully before dragging.
    await assertOnPivotSettings(page);

    // Drag the second aggregate (Product category) from columns to rows.
    await moveDnDKitListElement(page, {
      testId: "drag-handle",
      startIndex: 1,
      dropIndex: 0,
    });

    // One field should now be empty
    await expect(page.getByText("Drag fields here", { exact: true })).toBeVisible();

    const viz = page.getByTestId("query-visualization-root");
    await expect(viz.getByText(/Products? → Category/)).toBeVisible();
    await expect(viz.getByText(/Users? → Source/)).toBeVisible();
    await expect(viz.getByText("Count", { exact: true })).toBeVisible();
    await expect(viz.getByText(/Totals for Doohickey/i)).toBeVisible();
    await expect(viz.getByText("3,976", { exact: true })).toBeVisible();
  });

  test("should be able to use binned numeric dimension as a grouping (metabase#14136)", async ({
    page,
  }) => {
    await visitPivotAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.SUBTOTAL, { binning: { strategy: "default" } }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {},
    });

    const viz = page.getByTestId("query-visualization-root");
    await expect(viz.getByText("Subtotal: 8 bins", { exact: true })).toBeVisible();
    await expect(viz.getByText("Count", { exact: true })).toBeVisible();
    await expect(viz.getByText("2,720", { exact: true })).toBeVisible();
    await expect(viz.getByText(/Grand totals/i)).toBeVisible();
    await expect(viz.getByText("18,760", { exact: true })).toBeVisible();
  });

  test("should allow collapsing rows", async ({ page }) => {
    // order count grouped by source, category x year
    const b1 = ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }];
    const b2 = ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }];
    const b3 = ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }];

    await visitPivotAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [b1, b2, b3],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CATEGORY", "SOURCE"],
          columns: ["CREATED_AT"],
          values: ["count"],
        },
      },
    });

    await expect(page.getByText("215", { exact: true })).toBeVisible(); // a non-subtotal value

    // click to collapse rows
    await collapseCell(page, "Doohickey");
    await expect(page.getByText("1,352", { exact: true })).toBeVisible(); // subtotal still there
    await expect(page.getByText("215", { exact: true })).toHaveCount(0); // value hidden

    // click to uncollapse
    await uncollapseCell(page, "Totals for Doohickey");
    await expect(page.getByText("215", { exact: true })).toBeVisible(); // ...and it's back!

    // collapse the column
    await collapseCell(page, "Product → Category");
    await expect(page.getByText("215", { exact: true })).toHaveCount(0); // value hidden
    await expect(page.getByText("294", { exact: true })).toHaveCount(0); // other section hidden too

    // uncollapse Doohickey
    await uncollapseCell(page, "Totals for Doohickey");
    await expect(page.getByText("215", { exact: true })).toBeVisible(); // doohickey visible
    await expect(page.getByText("294", { exact: true })).toHaveCount(0); // other still hidden
  });

  test("should show standalone values when collapsed to the sub-level grouping (metabase#25250)", async ({
    page,
  }) => {
    await visitPivotAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["<", ["field", ORDERS.CREATED_AT, null], "2025-06-01"],
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", ORDERS.USER_ID, null],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CREATED_AT", "USER_ID", "PRODUCT_ID"],
          columns: [],
          values: ["count"],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: ["CREATED_AT", "USER_ID", "PRODUCT_ID"],
        },
      },
    });

    await expect(page.getByText("1162", { exact: true })).toBeVisible();
    // Collapse "User ID" column
    await collapseCell(page, "User ID");
    await expect(
      page.getByText("Totals for 1162", { exact: true }),
    ).toBeVisible();

    // Expanding the grouped column should still work
    await uncollapseCell(page, "Totals for 1162");
    await expect(page.getByText("1162", { exact: true })).toBeVisible();
    await expect(page.getByText("34", { exact: true })).toBeVisible();
  });

  test("should allow hiding subtotals", async ({ page }) => {
    await visitPivotAdhoc(page, {
      dataset_query: testQuery,
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["SOURCE", "CATEGORY"],
          columns: [],
          values: [],
        },
      },
    });

    await expect(
      page.getByText(/Count by Users? → Source and Products? → Category/),
    ).toBeVisible();
    await expect(page.getByText("3,520", { exact: true })).toBeVisible(); // a subtotal

    await openVizSettingsSidebar(page);
    await assertOnPivotSettings(page);

    // Product -> Category has no option to hide subtotals
    await openColumnSettings(page, "Product → Category");
    await expect(page.getByText("Show totals", { exact: true })).not.toBeVisible();

    // turn off subtotals for User -> Source
    await openColumnSettings(page, "User → Source");
    const showTotals = page.getByTestId(
      "chart-settings-widget-pivot_table.column_show_totals",
    );
    await expect(showTotals.getByText("Show totals", { exact: true })).toBeVisible();
    await showTotals.getByRole("switch").click({ force: true });

    await expect(page.getByText("3,520", { exact: true })).toHaveCount(0); // subtotal gone
  });

  test("should uncollapse a value when hiding the subtotals", async ({
    page,
  }) => {
    const rows = ["SOURCE", "CATEGORY"];
    await visitPivotAdhoc(page, {
      dataset_query: testQuery,
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": { rows, columns: [], values: [] },
        "pivot_table.collapsed_rows": { value: ['["Affiliate"]'], rows },
      },
    });

    await expect(page.getByText("899", { exact: true })).toHaveCount(0); // Affiliate collapsed
    await expect(page.getByText("3,520", { exact: true })).toBeVisible(); // affiliate subtotal

    await openVizSettingsSidebar(page);

    // turn off subtotals for User -> Source
    await openColumnSettings(page, "User → Source");
    const showTotals = page.getByTestId(
      "chart-settings-widget-pivot_table.column_show_totals",
    );
    await expect(showTotals.getByText("Show totals", { exact: true })).toBeVisible();
    await showTotals.getByRole("switch").click({ force: true });

    await expect(page.getByText("3,520", { exact: true })).toHaveCount(0); // subtotal gone
    await expect(page.getByText("899", { exact: true })).toBeVisible(); // Affiliate uncollapsed
  });

  test("should allow column formatting", async ({ page }) => {
    await visitPivotAdhoc(page, {
      dataset_query: testQuery,
      display: "pivot",
    });

    await expect(
      page.getByText(/Count by Users? → Source and Products? → Category/),
    ).toBeVisible();

    await openVizSettingsSidebar(page);
    await assertOnPivotSettings(page);
    await openColumnSettings(page, "User → Source");

    await expect(page.getByText(/Column title/)).toBeVisible();

    const titleInput = page.locator("input#column_title");
    await titleInput.fill("ModifiedTITLE");
    await titleInput.blur();
    await page.getByText("Done", { exact: true }).click();
    await expect(
      page.getByTestId("query-visualization-root").getByText("ModifiedTITLE", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should allow value formatting", async ({ page }) => {
    await visitPivotAdhoc(page, {
      dataset_query: testQuery,
      display: "pivot",
    });

    await expect(
      page.getByText(/Count by Users? → Source and Products? → Category/),
    ).toBeVisible();

    await openVizSettingsSidebar(page);
    await assertOnPivotSettings(page);
    await openColumnSettings(page, "Count");

    await expect(page.getByText("Column title", { exact: true })).toBeVisible();
    await expect(page.getByText("Style", { exact: true })).toBeVisible();
    await expect(page.getByText("Separator style", { exact: true })).toBeVisible();

    // Change the value formatting to Percent.
    await (await findDisplayValue(page, "Normal")).click();
    await page.getByText("Percent", { exact: true }).click();
    await page.getByText("Done", { exact: true }).click();
    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText("78,300%", { exact: true }),
    ).toBeVisible();
  });

  test("should not allow sorting of value fields", async ({ page }) => {
    await visitPivotAdhoc(page, {
      dataset_query: testQuery,
      display: "pivot",
    });

    await expect(
      page.getByText(/Count by Users? → Source and Products? → Category/),
    ).toBeVisible();

    await openVizSettingsSidebar(page);
    await assertOnPivotSettings(page);
    await openColumnSettings(page, "Count");

    await expect(page.getByText(/Sort order/)).not.toBeVisible();
  });

  test("should allow sorting fields", async ({ page }) => {
    // Pivot by a single column with many values (100 bins) — sorted-away values
    // fall off the end, letting us assert on presence.
    await visitPivotAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.TOTAL,
              { binning: { strategy: "num-bins", "num-bins": 100 } },
            ],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
    });

    await openVizSettingsSidebar(page);

    await sortColumnResults(page, "Total: 100 bins", "descending");
    const pivot = page.getByTestId("pivot-table").first();
    await expect(pivot.getByText("158 – 160", { exact: true })).toBeVisible();
    await expect(pivot.getByText("8 – 10", { exact: true })).toHaveCount(0);

    await sortColumnResults(page, "Total: 100 bins", "ascending");
    await expect(pivot.getByText("8 – 10", { exact: true })).toBeVisible();
    await expect(pivot.getByText("158 – 160", { exact: true })).toHaveCount(0);
  });

  test("should display an error message for native queries", async ({ page }) => {
    // The error only renders once the native query has run (checkRenderable
    // inspects the result columns' `source`), so run it via the native-autorun
    // helper rather than just visiting the hash.
    await visitNativeQuestionAdhoc(page, {
      dataset_query: {
        type: "native",
        native: { query: "select 1", "template-tags": {} },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
    });

    await expect(
      page.getByText(
        "Pivot tables are only supported for questions built in the query builder.",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test.describe("dashboards", () => {
    test("should be scrollable even when tiny (metabase#24678)", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: {
          name: QUESTION_NAME,
          query: testQuery.query,
          display: "pivot",
        },
        dashboardDetails: { name: DASHBOARD_NAME },
        cardDetails: { size_x: 3, size_y: 3 },
      });
      await visitDashboard(page, mb.api, dashboardId);

      const cell = getDashboardCard(page, 0).getByText("Doohickey", {
        exact: true,
      });
      await cell.scrollIntoViewIfNeeded();
      await expect(cell).toBeVisible();
    });

    test("should allow filtering drill through (metabase#14632) (metabase#14465)", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: {
          name: QUESTION_NAME,
          query: testQuery.query,
          display: "pivot",
        },
        dashboardDetails: { name: DASHBOARD_NAME },
        cardDetails: { size_x: 16, size_y: 8 },
      });
      await visitDashboard(page, mb.api, dashboardId);

      await assertOnPivotFields(page);
      await page.getByText("Google", { exact: true }).click(); // open drill menu
      await popover(page).getByText("=", { exact: true }).click(); // drill with filter
      await expect(
        page.getByText("User → Source is Google", { exact: true }),
      ).toBeVisible(); // filter added
      await expect(page.getByText("Row totals", { exact: true })).toBeVisible(); // still a pivot
      await expect(page.getByText("1,027", { exact: true })).toBeVisible(); // primary value
      await expect(page.getByText("3,798", { exact: true })).toBeVisible(); // subtotal value
    });

    test("should show no-results then hide an empty pivot dashcard (UXW-4145)", async ({
      page,
      mb,
    }) => {
      const FILTER_ID = "d7988e02";

      const { dashboardId, dashcards } =
        await mb.api.createQuestionAndDashboard({
          questionDetails: {
            name: QUESTION_NAME,
            query: testQuery.query,
            display: "pivot",
          },
          dashboardDetails: { name: DASHBOARD_NAME },
          cardDetails: { size_x: 16, size_y: 8 },
        });
      const { id, card_id } = dashcards[0];

      // Add an ID filter to the dashboard and map it to the pivot card.
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        parameters: [{ id: FILTER_ID, name: "ID", slug: "id", type: "id" }],
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 8,
            parameter_mappings: [
              {
                parameter_id: FILTER_ID,
                card_id,
                target: ["dimension", ["field", ORDERS.ID]],
              },
            ],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);

      // Filtering to a value with no rows shows the no-results state.
      await filterWidget(page).click();
      const paramPopover = page.getByTestId("parameter-value-dropdown");
      await paramPopover.getByPlaceholder("Enter an ID").fill("-1");
      await paramPopover.getByPlaceholder("Enter an ID").press("Enter");
      await paramPopover.getByRole("button", { name: "Add filter" }).click();
      // Pre-fix this rendered a blank pivot; the grand-total row hid the emptiness.
      await expect(
        getDashboardCard(page, 0).getByText("No results", { exact: true }),
      ).toBeVisible();

      // Enabling 'hide if empty' removes the now-empty card.
      await editDashboard(page);
      await showDashboardCardActions(page, 0);
      await page
        .getByTestId("dashboardcard-actions-panel")
        .locator(".Icon-palette")
        .click({ force: true });
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Hide this card if there are no results")
        .click({ force: true });
      await dialog.getByRole("button", { name: "Done" }).click();
      await saveDashboard(page);

      await expect(page.getByTestId("dashcard")).toHaveCount(0);
    });
  });

  test.describe("sharing (metabase#14447)", () => {
    let questionId: number;
    let dashboardId: number;

    test.beforeEach(async ({ page, mb }) => {
      // Row totals on embed preview was getting cut off at the normal width.
      await page.setViewportSize({ width: 1400, height: 800 });

      const res = await mb.api.createQuestionAndDashboard({
        questionDetails: {
          name: QUESTION_NAME,
          query: testQuery.query,
          display: "pivot",
        },
        dashboardDetails: { name: DASHBOARD_NAME },
        cardDetails: { size_x: 16, size_y: 8 },
      });
      questionId = res.questionId;
      dashboardId = res.dashboardId;
      const cardId = res.dashcards[0].card_id;

      // Enable sharing + embedding on both card and dashboard.
      await mb.api.post(`/api/card/${cardId}/public_link`, {});
      await mb.api.put(`/api/card/${cardId}`, { enable_embedding: true });
      await mb.api.post(`/api/dashboard/${dashboardId}/public_link`, {});
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        enable_embedding: true,
      });

      await visitQuestion(page, cardId);
    });

    for (const testCase of TEST_CASES) {
      test.describe(testCase.case, () => {
        test.beforeEach(async ({ page }) => {
          await page.goto("/collection/root");
          await page.getByText(testCase.subject, { exact: true }).click();
        });

        test("should display pivot table in a public link", async ({
          page,
          mb,
        }) => {
          await expect(page.getByTestId("pivot-table")).toBeVisible();
          if (testCase.case === "question") {
            await openSharingMenu(page);
            await modal(page).getByText("Save", { exact: true }).click();
          }
          await openSharingMenu(page, /public link/i);
          const linkValue = await page
            .getByTestId("public-link-popover-content")
            .getByTestId("public-link-input")
            .inputValue();
          await page.goto(rebaseUrl(linkValue, mb.baseUrl));
          await expect(page.getByTestId("embed-frame-header")).toContainText(
            testCase.subject,
          );
          await assertOnPivotFields(page);
        });

        test("should display pivot table in an embed URL", async ({
          page,
          mb,
        }) => {
          await expect(page.getByTestId("pivot-table")).toBeVisible();
          if (testCase.case === "question") {
            await openSharingMenu(page);
            await modal(page).getByText("Save", { exact: true }).click();
          }

          const resource =
            testCase.case === "question" ? "question" : "dashboard";
          const resourceId =
            testCase.case === "question" ? questionId : dashboardId;

          await openLegacyStaticEmbeddingModal(page, mb.api, {
            resource,
            resourceId,
            activeTab: "parameters",
            unpublishBeforeOpen: false,
          });

          // visit the iframe src directly to ensure it's not using preview endpoints
          const { frame } = await visitIframe(page, mb);

          await expect(frame.getByTestId("embed-frame-header")).toContainText(
            testCase.subject,
          );
          await assertOnPivotFields(frame);
        });
      });
    }
  });

  test("should show a download widget with a hint about pivoted xlsx exports (metabase#14750)", async ({
    page,
    mb,
  }) => {
    const HINT_TEXT =
      "Trying to pivot this data in Excel? You should download the raw data instead.";
    await createTestQuestion(page, mb.api);
    // .first(): download icons can appear more than once in the QB footer.
    await icon(page, "download").first().click();

    const menu = popover(page);
    await menu.getByText(".xlsx", { exact: true }).click();
    // The hint text shares its element with the "Read the docs" link (mixed
    // content), so it's matched as a substring, not an exact string. .first():
    // the substring also matches the enclosing Flex/Stack.
    await expect(menu.getByText(HINT_TEXT).first()).toBeVisible();
    await expect(menu.getByText("Read the docs", { exact: true })).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/questions/exporting-results.html#exporting-pivot-tables",
    );

    await menu.getByLabel("Close hint").click();
    await expect(menu.getByText(HINT_TEXT)).toHaveCount(0);

    await expect(menu.getByText("Download", { exact: true })).toBeVisible();

    // Ensure the hint is not visible after a page reload
    await page.reload();
    await icon(page, "download").first().click();
    await expect(popover(page).getByText(HINT_TEXT)).toHaveCount(0);
  });

  test("should work with custom mapping of display values (metabase#14985)", async ({
    page,
    mb,
  }) => {
    // Remap 'Reviews Rating' display values to custom values.
    await mb.api.post(`/api/field/${REVIEWS.RATING}/dimension`, {
      name: "Rating",
      type: "internal",
      human_readable_field_id: null,
    });
    await mb.api.post(`/api/field/${REVIEWS.RATING}/values`, {
      values: [
        [1, "A"],
        [2, "B"],
        [3, "C"],
        [4, "D"],
        [5, "E"],
      ],
    });

    await visitPivotAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field-id", REVIEWS.RATING],
            ["datetime-field", ["field-id", REVIEWS.CREATED_AT], "year"],
          ],
        },
        type: "query",
      },
      display: "line",
    });

    await page.getByText("Visualization", { exact: true }).click();
    await leftSidebar(page).getByTestId("more-charts-toggle").click();

    const pivotDataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset/pivot",
    );
    await icon(leftSidebar(page), "pivot_table").click({ force: true });
    await pivotDataset;

    const viz = page.getByTestId("query-visualization-root");
    await expect(viz.getByText("Row totals").first()).toBeVisible();
    await expect(viz.getByText("333", { exact: true })).toBeVisible(); // Row totals for 2027
    await expect(viz.getByText("Grand totals", { exact: true })).toBeVisible();
  });

  test("should show stand-alone row values in grouping when rows are collapsed (metabase#15211)", async ({
    page,
  }) => {
    await visitPivotAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.DISCOUNT, null]], ["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
          filter: [
            "and",
            [
              "between",
              ["field", ORDERS.CREATED_AT, null],
              "2025-11-09",
              "2025-11-11",
            ],
            ["!=", ["field", ORDERS.PRODUCT_ID, null], 146],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CREATED_AT", "PRODUCT_ID"],
          columns: [],
          values: ["sum", "count"],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: ["CREATED_AT", "PRODUCT_ID"],
        },
      },
    });

    await expect(page.getByText("November 9, 2025", { exact: true })).toBeVisible();
    await expect(
      page.getByText("November 10, 2025", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("November 11, 2025", { exact: true }),
    ).toBeVisible();

    await collapseCell(page, "Created At: Day");

    await expect(
      page.getByText("Totals for November 9, 2025", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Totals for November 10, 2025", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Totals for November 11, 2025", { exact: true }),
    ).toBeVisible();
  });

  test("should not show subtotals for flat tables", async ({ page }) => {
    await visitPivotAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
          ],
          filter: [">", ["field", ORDERS.CREATED_AT, null], "2029-01-01"],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["STATE", "CREATED_AT"],
          columns: ["CATEGORY"],
          values: ["sum"],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: ["STATE", "CREATED_AT"],
        },
      },
    });

    await expect(page.getByText(/Totals for .*/i)).toHaveCount(0);
  });

  test("should apply conditional formatting", async ({ page }) => {
    await visitPivotAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
          ],
          filter: [">", ["field", ORDERS.CREATED_AT, null], "2029-01-01"],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["STATE", "CREATED_AT"],
          columns: ["CATEGORY"],
          values: ["sum"],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: ["STATE", "CREATED_AT"],
        },
      },
    });

    await openVizSettingsSidebar(page);
    await page.getByText("Conditional Formatting", { exact: true }).click();

    await page.getByText("Add a rule", { exact: true }).click();
    const valueInput = page.getByTestId("conditional-formatting-value-input");
    await valueInput.fill("70");
    await valueInput.blur();
    // The operator is a Mantine Select; its display text div isn't clickable
    // (zero-box) — open the select and pick the option.
    await page
      .getByTestId("conditional-formatting-value-operator-button")
      .click();
    await page
      .getByRole("option", { name: "is less than or equal to", exact: true })
      .click();

    await expect(
      page.getByTestId("pivot-table-cell").filter({ hasText: "65.09" }).first(),
    ).toHaveCSS("background-color", "rgba(80, 158, 227, 0.65)");
  });

  test("should sort by metric (metabase#22872)", async ({ page }) => {
    await visitPivotAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
            [
              "field",
              REVIEWS.CREATED_AT,
              {
                "temporal-unit": "year",
                "base-type": "type/DateTimeWithLocalTZ",
              },
            ],
          ],
        },
        type: "query",
      },
      display: "pivot",
    });

    await expect(page.getByText("Created At: Year", { exact: true })).toBeVisible();
    await expect(page.getByText("Row totals", { exact: true })).toBeVisible();

    await assertTopMostRowTotalValue(page, "149");

    await openNotebook(page);

    await page.getByText("Sort", { exact: true }).click();

    // The notebook doesn't auto-run when the sort is added; the pivot query
    // fires on Visualize, so register the wait and await it after that click.
    const pivotDataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset/pivot",
    );
    await popover(page).getByText("Count", { exact: true }).click();

    await page.getByRole("button", { name: "Visualize", exact: true }).click();
    await pivotDataset;

    await assertTopMostRowTotalValue(page, "23");
  });

  test("should be horizontally scrollable when columns overflow", async ({
    page,
    mb,
  }) => {
    const createdAtField = [
      "field",
      REVIEWS.CREATED_AT,
      { "temporal-unit": "month", "base-type": "type/DateTimeWithLocalTZ" },
    ];
    const ratingField = ["field", REVIEWS.RATING, { "base-type": "type/Integer" }];

    // Extracted to a variable so the extra visualization_settings key isn't
    // rejected by the excess-property check on api.createQuestion's param type.
    const questionDetails = {
      name: QUESTION_NAME,
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [createdAtField, ratingField],
      },
      display: "pivot",
      visualization_settings: {
        rows: ratingField,
        columns: createdAtField,
        "pivot_table.column_split": {
          rows: ["RATING"],
          columns: ["CREATED_AT"],
          values: ["count"],
        },
      },
    };
    const { dashboardId, questionId } = await mb.api.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails: { name: DASHBOARD_NAME },
      cardDetails: { size_x: 16, size_y: 8 },
    });

    await visitDashboard(page, mb.api, dashboardId);

    await scrollGridToEnd(getDashboardCard(page, 0));
    await expect(
      getDashboardCard(page, 0).getByText("Row totals", { exact: true }),
    ).toBeVisible();

    await visitQuestion(page, questionId);

    await scrollGridToEnd(queryBuilderMain(page));
    await expect(
      queryBuilderMain(page).getByText("Row totals", { exact: true }),
    ).toBeVisible();
  });

  test.describe("column resizing", () => {
    test("should persist column sizes in visualization settings", async ({
      page,
    }) => {
      await visitPivotAdhoc(page, {
        dataset_query: testQuery,
        display: "pivot",
      });

      const handles = page.getByTestId("pivot-table-resize-handle");
      await expect(handles.first()).toBeVisible();

      await moveDnDKitPointer(handles.first(), { horizontal: -100, vertical: 0 });
      await moveDnDKitPointer(handles.last(), { horizontal: 100, vertical: 0 });

      const pivot = page.getByTestId("pivot-table");
      expect(
        await cellContentWidth(pivot.getByText("User → Source", { exact: true })),
      ).toBe(80); // min width is 80
      expect(
        await cellContentWidth(pivot.getByText("Row totals", { exact: true })),
      ).toBe(220);

      await saveAdhocQuestion(page, { path: ["Our analytics"] });

      await page.reload(); // reload to make sure the settings are persisted
      const pivot2 = page.getByTestId("pivot-table");
      await expect(
        pivot2.getByText("User → Source", { exact: true }),
      ).toBeVisible();
      expect(
        await cellContentWidth(
          pivot2.getByText("User → Source", { exact: true }),
        ),
      ).toBe(80);
      expect(
        await cellContentWidth(pivot2.getByText("Row totals", { exact: true })),
      ).toBe(220);
    });
  });

  test("should not have to wait for data to show fields in summarisation (metabase#26467)", async ({
    page,
    mb,
  }) => {
    // Delay the pivot card query so the QB is still loading when we open the
    // notebook (res.setDelay(20_000) in the Cypress original).
    await page.route("**/api/card/pivot/*/query", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      await route.continue();
    });

    const card = await createTestQuestion(page, mb.api, { visit: false });
    // manually visiting to avoid the auto wait logic — we need to reach the
    // editor while the query is still loading.
    await page.goto(`/question/${card.id}`);

    // confirm that it's loading
    await expect(
      page.locator("main").getByText("Doing science...", { exact: true }),
    ).toBeVisible();

    await openNotebook(page);

    await page
      .locator("main")
      .getByText("User → Source", { exact: true })
      .click();
    await popover(page).getByText("Address", { exact: true }).click();

    await expect(
      page.locator("main").getByText("User → Address", { exact: true }),
    ).toBeVisible();
  });

  test.describe("issue 37380", () => {
    let questionId: number;

    test.beforeEach(async ({ mb }) => {
      const categoryField = [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text" },
      ];
      const createdAtField = [
        "field",
        PRODUCTS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ];

      // reproduce 37380: user has access to the database, but not to the table
      await updatePermissionsGraph(mb.api, {
        [DATA_GROUP]: {
          [SAMPLE_DB_ID]: {
            "create-queries": {
              PUBLIC: {
                [PRODUCTS_ID]: "no",
              },
            },
          },
        },
      });

      const card = await createPivotQuestion(mb.api, {
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: ["count"],
          breakout: [categoryField, createdAtField],
        },
        display: "pivot",
        visualization_settings: {
          "pivot_table.column_split": {
            rows: ["CREATED_AT"],
            columns: ["CATEGORY"],
            values: ["count"],
          },
          "pivot_table.column_widths": {
            leftHeaderWidths: [141],
            totalLeftHeaderWidths: 141,
            valueHeaderWidths: {},
          },
        },
      });
      questionId = card.id;
    });

    test("does not allow users with no table access to update pivot questions (metabase#37380)", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await visitQuestion(page, questionId);
      await openVizSettingsSidebar(page);
      await page.getByLabel("Show row totals").click({ force: true });

      await expect(page.getByTestId("qb-save-button")).toHaveAttribute(
        "data-disabled",
      );
    });
  });

  test.describe("issue 38265", () => {
    test.beforeEach(async ({ page, mb }) => {
      const card = await mb.api.createQuestion({
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.SUBTOTAL, { "base-type": "type/Float" }]],
          ],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "month" },
            ],
            [
              "field",
              PEOPLE.STATE,
              { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
            ],
            [
              "field",
              PRODUCTS.CATEGORY,
              { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
            ],
          ],
        },
        display: "pivot",
      });
      await visitQuestion(page, card.id);
    });

    test("correctly filters the query when zooming in on a **row** header (metabase#38265)", async ({
      page,
    }) => {
      await page.getByTestId("pivot-table").getByText("KS", { exact: true }).click();
      await popover(page).getByText("Zoom in: State", { exact: true }).click();

      // Filter pills
      await expect(page.getByTestId("filter-pill")).toHaveText(
        "User → State is KS",
      );

      // Pivot table column headings
      const pivot = page.getByTestId("pivot-table");
      await expect(pivot).toContainText("Created At: Month");
      await expect(pivot).toContainText("User → Latitude");
      await expect(pivot).toContainText("User → Longitude");
    });
  });

  test("should be possible to switch between notebook and simple views when pivot table is the visualization (metabase#39504)", async ({
    page,
  }) => {
    await visitPivotAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.SUBTOTAL, { "base-type": "type/Float" }]],
            ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
          ],
          breakout: [
            [
              "field",
              PEOPLE.SOURCE,
              { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
            ],
          ],
        },
        type: "query",
      },
    });

    // Set the visualization to pivot table using the UI.
    await openVizTypeSidebar(page);
    const pivotDataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset/pivot",
    );
    await page.getByTestId("Pivot Table-button").click();
    await pivotDataset;

    const pivot = page.getByTestId("pivot-table");
    await expect(pivot).toContainText("User → Source");
    await expect(pivot).toContainText("Sum of Subtotal");
    await expect(pivot).toContainText("Sum of Total");
    await expect(pivot).toContainText("Grand totals");

    await openNotebook(page);
    const summarize = getNotebookStep(page, "summarize");
    await expect(summarize).toBeVisible();
    await expect(summarize).toContainText("Sum of Subtotal");
    await expect(summarize).toContainText("Sum of Total");

    // Close the notebook editor
    await openNotebook(page);
    const pivot2 = page.getByTestId("pivot-table");
    await expect(pivot2).toContainText("User → Source");
    await expect(pivot2).toContainText("Sum of Subtotal");
    await expect(pivot2).toContainText("Sum of Total");
    await expect(pivot2).toContainText("Grand totals");
  });

  test("displays total values for collapsed rows (metabase#26919)", async ({
    page,
    mb,
  }) => {
    const categoryField = [
      "field",
      PRODUCTS.CATEGORY,
      { "base-type": "type/Text" },
    ];

    const card = await createPivotQuestion(mb.api, {
      display: "pivot",
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          test: [
            "case",
            [[["is-null", categoryField], categoryField]],
            { default: categoryField },
          ],
        },
        aggregation: [["count"]],
        breakout: [
          ["expression", "test", { "base-type": "type/Text" }],
          [
            "field",
            PRODUCTS.RATING,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
        ],
      },
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["test", "RATING"],
          columns: [],
          values: ["count"],
        },
        "pivot_table.collapsed_rows": {
          value: ['["Doohickey"]', '["Gadget"]', '["Gizmo"]', '["Widget"]'],
          rows: ["test", "RATING"],
        },
      },
    });
    await visitQuestion(page, card.id);

    await expect(getPivotTableBodyCell(page, 0)).toHaveText("42");
    await expect(getPivotTableBodyCell(page, 1)).toHaveText("53");
    await expect(getPivotTableBodyCell(page, 2)).toHaveText("51");
    await expect(getPivotTableBodyCell(page, 3)).toHaveText("54");
    await expect(getPivotTableBodyCell(page, 4)).toHaveText("200");
  });

  test("renders a pivot table with only pivot columns (metabase#44500)", async ({
    page,
  }) => {
    await visitPivotAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.SUBTOTAL, { binning: { strategy: "default" } }],
            ["field", ORDERS.TAX, { binning: { strategy: "default" } }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [],
          columns: ["SUBTOTAL", "TAX"],
          values: ["count"],
        },
      },
    });

    await expect(getPivotTableBodyCell(page, 0)).toHaveText("34");
    await expect(getPivotTableBodyCell(page, 1)).toHaveText("1,594");
    await expect(getPivotTableBodyCell(page, 2)).toHaveText("823");
    await expect(getPivotTableBodyCell(page, 3)).toHaveText("974");
    await expect(getPivotTableBodyCell(page, 4)).toHaveText("3,104");
  });
});

/**
 * Port of the spec's assertTopMostRowTotalValue — a deliberately fragile
 * selector (see the upstream TODO): the 6th cell of the first grid row.
 */
async function assertTopMostRowTotalValue(page: Page, value: string) {
  await expect(page.locator("[role=row] > div").nth(5)).toHaveText(value);
}

/**
 * Reveal the far-right columns: Cypress scrollTo(10000, 0). The body grid is a
 * react-virtualized Grid wired through ScrollSync, which ignores a synthetic
 * scrollLeft assignment (it re-imposes the controlled prop) — a real wheel event
 * over the grid is what it acts on.
 */
async function scrollGridToEnd(scope: ReturnType<Page["getByTestId"]>) {
  const grid = scope.getByLabel(PIVOT_TABLE_BODY_LABEL);
  await grid.hover();
  await grid.page().mouse.wheel(10000, 0);
}

function rebaseUrl(url: string, baseUrl: string): string {
  const target = new URL(url);
  const base = new URL(baseUrl);
  target.protocol = base.protocol;
  target.host = base.host;
  return target.href;
}
