/**
 * Playwright port of e2e/test/scenarios/visualizations-tabular/table.cy.spec.js
 * (5 describes, 29 tests).
 *
 * Port notes
 * ----------
 * - GATING. Two tests carry upstream's `{ tags: ["@external"] }` and are gated
 *   on PW_QA_DB_ENABLED (rule 6). Only ONE of them really needs a container —
 *   "should work with boolean columns" restores `postgres-writable`, rebuilds
 *   `many_data_types` in the writable QA postgres and resyncs it. The other,
 *   "should work with time columns", is tagged `@external` upstream but runs a
 *   native H2 query against the sample DB and needs no container at all; it is
 *   gated anyway so the port matches upstream's tag exactly (noted rather than
 *   silently widened — PORTING's "audit a spec's snapshot/gate dependencies").
 * - `headerCells()` (spec-local) is page-wide upstream; the port scopes it to
 *   `table-header` (see support/visualizations-table.ts for why that resolves
 *   to the same set and why the page-wide form is a latent flake).
 * - `H.tableHeaderColumn(x)` returns the TEXT node inside the header cell, and
 *   that node is the dnd-kit drag target; `moveDnDKitElementByAlias` →
 *   `moveDnDKitPointer` (support/dnd.ts), which re-reads the box before every
 *   pointer event — required, because the header slides mid-drag.
 * - `cy.trigger("mouseover"/"mousedown"/...)` is a SYNTHETIC dispatch at the
 *   element centre, not a real hover/press → `triggerMouseEvent`.
 *   `cy.realHover()` → `hover()`.
 * - `cy.clock()/cy.tick()` in the slow-loading test is replaced by real time:
 *   `page.clock.install()` does not freeze time (PORTING), and the assertion is
 *   the same either way. `SLOW_MESSAGE_TIMEOUT` is 4000ms
 *   (querying/components/QueryVisualization), the route delay is 10s, so both
 *   messages are observable inside the delay window. Costs ~5s of wall clock.
 * - `should("contain", x)` / `should("not.contain", x)` on a MULTI-element
 *   subject is chai-jquery's `$el.is(":contains(x)")` — an ANY-of-set assertion
 *   (rule 3) → `expectAnyCellContains` / `expectNoCellContains`.
 * - `H.readClipboard().should("equal", …)` retries → `expect.poll`.
 * - `cy.realPress(["Meta","c"])` is NOT platform-aware upstream; the port uses
 *   `ControlOrMeta` so the modifier matches the platform the app checks for.
 * - Snowplow: the "with tracking" describe's events ARE the subject, so it uses
 *   `installSnowplowCapture` (browser-boundary capture) rather than rule 6's
 *   no-op stub. `table_freeze_*_enabled` are `trackSimpleEvent` call sites in
 *   `frontend/src/metabase/visualizations/analytics.ts`, i.e. the FE-emitted
 *   class the capture covers. `expectNoBadSnowplowEvents` degrades to the
 *   documented structural check (no Iglu validation without micro).
 * - `cy.intercept("GET", "/api/field/*​/search/*").as("findSuggestions")` in the
 *   first describe's beforeEach is awaited by exactly one test; registered
 *   there instead (rule 2).
 * - `openPeopleTable({ mode: "notebook", limit })`: the shared `openTable`
 *   notebook path drops `limit`, but upstream's does not — the port uses
 *   `openTableNotebookWithLimit` (custom-column.ts) so the row limit is real.
 */
import type { BrowserContext, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import type { MetabaseApi } from "../support/api";
import { resetTestTable } from "../support/actions-on-dashboards";
import { openOrdersTable, openPeopleTable } from "../support/ad-hoc-question";
import { leftSidebar, openVizSettingsSidebar } from "../support/charts";
import { openTableNotebookWithLimit } from "../support/custom-column";
import {
  editDashboard,
  getDashboardCard,
  pickEntity,
  saveDashboard,
} from "../support/dashboard";
import {
  grantClipboardPermissions,
  readClipboard,
} from "../support/dashboard-card-repros";
import { resizeDashboardCard } from "../support/dashboard-card-resizing";
import { dashboardCards } from "../support/dashboard-tabs";
import { moveDnDKitPointer } from "../support/dnd";
import {
  createNativeQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { hovercard } from "../support/filter-bulk";
import { miniPickerBrowseAll, selectFilterOperator } from "../support/joins";
import { assertTableData } from "../support/multiple-column-breakouts";
import { startNewNativeQuestion } from "../support/native-editor";
import { summarize } from "../support/nested-questions";
import {
  enterCustomColumnDetails,
  expressionEditorWidget,
  notebookButton,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { clickActionsPopover } from "../support/relative-datetime";
import { isScrollableHorizontally } from "../support/search";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { openSharingMenu } from "../support/sharing";
import {
  assertRowHeight,
  tableInteractiveBody,
} from "../support/table-column-settings";
import {
  icon,
  modal,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import {
  assertCanViewOrdersTableDashcard,
  columnHeaderOf,
  expectAnyCellContains,
  expectNoCellContains,
  getColumnWidth,
  getWritableTable,
  headerCells,
  outerWidth,
  hoverForHovercard,
  tableHeaderText,
  triggerMouseEvent,
} from "../support/visualizations-table";
import {
  moveDnDKitElementVertically,
  openObjectDetail,
} from "../support/viz-charts-repros";
import { resizeTableColumn } from "../support/viz-tabular-repros";

const QA_DB_SKIP =
  "@external — requires the writable QA postgres database and its postgres-writable snapshot (set PW_QA_DB_ENABLED)";

function tableInteractive(page: Page) {
  return page.getByTestId("table-root");
}

function sidebar(page: Page) {
  return page.locator("main aside");
}

/** Port of the spec-local `selectFromDropdown` — `H.popover().last()`. */
async function selectFromDropdown(page: Page, option: string) {
  await popover(page).last().getByText(option, { exact: true }).click();
}

/** Port of the spec-local `joinTable`. */
async function joinTable(page: Page, table: string) {
  await page.getByText("Join data", { exact: true }).click();
  await miniPickerBrowseAll(page).click();
  await pickEntity(page, {
    path: ["Databases", "Sample Database", table],
  });
}

/** Port of `H.showDashcardVisualizationSettings(index)`. */
async function showDashcardVisualizationSettings(page: Page, index = 0) {
  const card = getDashboardCard(page, index);
  await card.hover();
  await card
    .getByLabel("Show visualization options", { exact: true })
    .click();
}

test.describe("scenarios > visualizations > table", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not be sortable when displays raw query results (metabase#19817)", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
    // `QuestionDisplayToggle` is a Mantine SegmentedControl whose two options
    // are declared `disabled: true` — the real handler lives on the SegmentedControl
    // root — so Playwright's actionability refuses the click while Cypress's
    // plain .click() dispatches at the resolved element and bubbles up.
    // dispatchEvent, not click({ force: true }): a forced click still moves the
    // REAL mouse and hits whatever is topmost at those coordinates, which is not
    // what Cypress does.
    await page.getByLabel("Switch to data", { exact: true }).dispatchEvent("click");
    const initialColumnsOrder = ["Created At: Year", "Count"];

    await assertTableData(page, { columns: initialColumnsOrder });

    await moveDnDKitPointer(tableHeaderText(page, "Count"), {
      horizontal: -100,
    });

    await assertTableData(page, { columns: initialColumnsOrder });

    await notebookButton(page).click();

    await page.getByTestId("step-preview-button").nth(1).click();

    await assertTableData(page, { columns: initialColumnsOrder });

    await moveDnDKitPointer(tableHeaderText(page, "Count"), {
      horizontal: -100,
    });

    await assertTableData(page, { columns: initialColumnsOrder });
  });

  test("should allow changing column title when the field ref is the same except for the join-alias", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await joinTable(page, "Orders");
    await selectFromDropdown(page, "ID");
    await selectFromDropdown(page, "User ID");
    await visualize(page);

    // Rename the first ID column, and make sure the second one is not updated
    await tableHeaderClick(page, "ID");
    const columnPopover = popover(page);
    await expect(
      columnPopover.getByText("Filter by this column", { exact: true }),
    ).toBeVisible();
    await icon(columnPopover, "gear").click();

    // cy.type() clicks its subject first and appends at the end of the value.
    const title = columnPopover.getByLabel("Column title", { exact: true });
    await title.click();
    await title.press("End");
    await title.pressSequentially(" updated");
    // This defocuses the input, which triggers the update
    await columnPopover.getByText("Column title", { exact: true }).click();

    await page.keyboard.press("Escape");
    await expect(
      headerCells(page).getByText("ID updated", { exact: true }),
    ).toHaveCount(1);
  });

  test("should allow selecting cells in a table and copy the values", async ({
    page,
    context,
  }: {
    page: Page;
    context: BrowserContext;
  }) => {
    await grantClipboardPermissions(context);

    await openOrdersTable(page);

    const nonPkCells = tableInteractiveBody(page).locator(
      '[data-selectable-cell]:not([data-column-id="ID"])',
    );

    const assertSelectedCells = async (expectedCount: number) => {
      await expect(
        tableInteractiveBody(page).locator(
          '[data-selectable-cell][aria-selected="true"]',
        ),
      ).toHaveCount(expectedCount);
    };

    // Single cell selection by clicking
    const firstCell = nonPkCells.first();
    await firstCell.click();
    await expect(firstCell).toHaveAttribute("aria-selected", "true");

    // Multi-cell selection by dragging
    const startCell = nonPkCells.nth(0);
    const endCell = nonPkCells.nth(3);

    await triggerMouseEvent(startCell, "mousedown", { which: 1, buttons: 1 });
    await triggerMouseEvent(endCell, "mouseover", { buttons: 1 });
    await triggerMouseEvent(endCell, "mouseup");
    await assertSelectedCells(4);

    // Cmd+click to add cells to selection
    await nonPkCells.nth(5).click({ modifiers: ["ControlOrMeta"] });
    await assertSelectedCells(5);

    // Shift+click for range selection
    await nonPkCells.nth(4).click();
    await nonPkCells.nth(6).click({ modifiers: ["Shift"] });
    await assertSelectedCells(3);

    // Copy formatted content with Cmd+C
    await page.keyboard.press("ControlOrMeta+c");
    await expect
      .poll(() => readClipboard(page))
      .toBe(
        "Total\tDiscount ($)\tCreated At\n39.72\t\tFebruary 11, 2028, 9:40 PM",
      );

    // Copy unformatted content with Shift+Cmd+C
    await page.keyboard.press("Shift+ControlOrMeta+c");
    await expect
      .poll(() => readClipboard(page))
      .toBe(
        "Total\tDiscount ($)\tCreated At\n" +
          "39.718145389078366\tnull\t2028-02-11T21:40:27.892-08:00",
      );

    // Escape to clear selection
    await page.keyboard.press("Escape");
    await assertSelectedCells(0);

    // Click outside to clear selection
    await nonPkCells.nth(0).click();
    // Click outside the table
    await queryBuilderHeader(page)
      .getByText("Orders", { exact: true })
      .click();
    await assertSelectedCells(0);
  });

  test("should allow enabling row index column", async ({ page }) => {
    await openOrdersTable(page);
    await openVizSettingsSidebar(page);
    await sidebar(page).getByText("Display", { exact: true }).click();
    await sidebar(page).getByText("Show row index", { exact: true }).click();

    await openObjectDetail(page, 5);

    // Ensure click on row index opens the object detail
    const sixes = modal(page).getByText("6", { exact: true });
    await expect(sixes).toHaveCount(2);
    // `.and("be.visible")` on a 2-element subject is an ANY-of assertion.
    await expect(sixes.filter({ visible: true }).first()).toBeVisible();

    // Close object detail modal
    await page.keyboard.press("Escape");

    await sidebar(page).getByText("Show row index", { exact: true }).click();

    await expect(
      tableInteractive(page).getByTestId("row-id-cell").nth(5),
    ).not.toHaveText("6");
  });

  test("should allow you to reorder and hide columns in the table header", async ({
    page,
  }) => {
    await startNewNativeQuestion(page, {
      query: "select * from orders LIMIT 2",
    });
    await page
      .getByTestId("native-query-editor-container")
      .locator(".Icon-play")
      .click();

    await openVizSettingsSidebar(page);

    await page.getByTestId(/subtotal-hide-button/i).click();
    await page.getByTestId(/tax-hide-button/i).click();
    await page
      .getByTestId("sidebar-left")
      .getByText("Done", { exact: true })
      .click();

    await expect(headerCells(page).nth(3)).toContainText("TOTAL");
    await moveDnDKitPointer(tableHeaderText(page, "TOTAL"), {
      horizontal: -220,
    });
    await expect(headerCells(page).nth(1)).toContainText("TOTAL");

    await tableHeaderClick(page, "QUANTITY");
    await icon(popover(page), "eye_crossed_out").click();

    await expect(
      headerCells(page).filter({ hasText: /QUANTITY/ }),
    ).toHaveCount(0);
  });

  test("should preserve set widths after reordering (VIZ-439)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page, {
      query: 'select 1 "first_column", 2 "second_column"',
      display: "table",
      visualization_settings: { "table.column_widths": [600, 150] },
    });

    const waitForRun = () =>
      Promise.all([
        page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/search" &&
            url.searchParams.getAll("models").includes("dataset") &&
            url.searchParams.getAll("models").includes("table") &&
            url.searchParams.has("table_db_id")
          );
        }),
        page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/api/dataset",
        ),
      ]);

    let run = waitForRun();
    await page
      .getByTestId("native-query-editor-container")
      .locator(".Icon-play")
      .click();
    await run;

    const firstWidth = await outerWidth(tableHeaderText(page, "first_column"));
    const secondWidth = await outerWidth(
      tableHeaderText(page, "second_column"),
    );

    await moveDnDKitPointer(tableHeaderText(page, "first_column"), {
      horizontal: 100,
    });

    const assertUnchangedWidths = async () => {
      await expect
        .poll(() => outerWidth(tableHeaderText(page, "first_column")))
        .toBe(firstWidth);
      await expect
        .poll(() => outerWidth(tableHeaderText(page, "second_column")))
        .toBe(secondWidth);
    };

    await assertUnchangedWidths();
    await page.reload();

    run = waitForRun();
    await page
      .getByTestId("native-query-editor-container")
      .locator(".Icon-play")
      .click();
    // Wait for column widths to be set
    await run;
    await expect(tableHeaderText(page, "first_column")).toBeVisible();
    await assertUnchangedWidths();
  });

  test("should allow to display any column as link with extrapolated url and text", async ({
    page,
  }) => {
    await openPeopleTable(page, { limit: 2 });

    await tableHeaderClick(page, "City");

    await icon(popover(page), "gear").click();

    await page.getByText("Link", { exact: true }).click();

    const linkText = page.getByLabel("Link text", { exact: true });
    await linkText.click();
    await linkText.press("End");
    // Cypress types "{{C" literally (no closing brace → not a special sequence).
    await linkText.pressSequentially("{{C");
    await page
      .getByTestId("select-list")
      .getByText("CITY", { exact: true })
      .click();

    await linkText.click();
    await linkText.press("End");
    await linkText.pressSequentially(" {{ID}} fixed text");
    await linkText.blur();

    const linkUrl = page.getByLabel("Link URL", { exact: true });
    await linkUrl.click();
    await linkUrl.press("End");
    await linkUrl.pressSequentially("http://metabase.com/people/{{ID}}");
    await linkUrl.blur();

    await expect(
      // The table renders each row once per horizontal quadrant, so the same
      // anchor (identical text AND href) exists twice.
      page.getByText("Wood River 1 fixed text", { exact: true }).first(),
    ).toHaveAttribute("href", "http://metabase.com/people/1");
  });

  test("should show field metadata in a hovercard when hovering over a table column header", async ({
    page,
  }) => {
    const ccName = "Foo";

    await openTableNotebookWithLimit(page, SAMPLE_DATABASE.PEOPLE_ID, 2);

    await page.getByLabel("Custom column", { exact: true }).click();

    await enterCustomColumnDetails(page, {
      formula: "concat([Name], [Name])",
      name: ccName,
    });

    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await page.getByTestId("fields-picker").click();
    const fieldsPopover = popover(page);
    await fieldsPopover.getByText("Select all", { exact: true }).click();
    await fieldsPopover.getByText("City", { exact: true }).click();
    await fieldsPopover.getByText("State", { exact: true }).click();
    await fieldsPopover.getByText("Birth Date", { exact: true }).click();
    await fieldsPopover.getByText("Latitude", { exact: true }).click();

    // Click anywhere else to close the popover which is blocking the Visualize button
    await page
      .getByTestId("query-builder-root")
      .click({ position: { x: 0, y: 0 } });

    await visualize(page);

    const cellNamed = (text: string) =>
      page
        .getByTestId("cell-data")
        .filter({ hasText: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
        // react-virtualized keeps an off-screen visibility:hidden measurement
        // clone; Cypress's .trigger() requires actionability, so the element it
        // resolved to was always the visible one.
        .filter({ visible: true })
        .first();

    const columns: [string, () => Promise<void>][] = [
      [
        "ID",
        async () => {
          // semantic type
          await expect(hovercard(page)).toContainText("Entity Key");
          // description
          await expect(hovercard(page)).toContainText(
            "A unique identifier given to each user.",
          );
        },
      ],
      [
        "City",
        async () => {
          await expect(hovercard(page)).toContainText("City");
          await expect(
            hovercard(page).getByText(
              "The city of the account’s billing address",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            hovercard(page).getByText("1,966 distinct values", { exact: true }),
          ).toBeVisible();
        },
      ],
      [
        "State",
        async () => {
          await expect(hovercard(page)).toContainText("State");
          await expect(
            hovercard(page).getByText("49 distinct values", { exact: true }),
          ).toBeVisible();
          await expect(hovercard(page)).toContainText("AK, AL, AR");
        },
      ],
      [
        "Birth Date",
        async () => {
          await expect(hovercard(page)).toContainText("No special type");
          await expect(
            hovercard(page).getByText("Timezone", { exact: true }),
          ).toBeVisible();
          await expect(
            hovercard(page).getByText("April 26, 1958, 12:00 AM", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            hovercard(page).getByText("April 3, 2000, 12:00 AM", {
              exact: true,
            }),
          ).toBeVisible();
        },
      ],
      [
        "Latitude",
        async () => {
          await expect(hovercard(page)).toContainText("Latitude");
          await expect(hovercard(page)).toContainText("39.88");
          await expect(
            hovercard(page).getByText("25.78", { exact: true }),
          ).toBeVisible();
          await expect(
            hovercard(page).getByText("70.64", { exact: true }),
          ).toBeVisible();
        },
      ],
      [
        ccName,
        async () => {
          await expect(hovercard(page)).toContainText("No special type");
          await expect(
            hovercard(page).getByText("No description", { exact: true }),
          ).toBeVisible();
        },
      ],
    ];

    for (const [column, assertion] of columns) {
      await triggerMouseEvent(cellNamed(column), "mouseover");

      // Add a delay here because there can be two popovers active for a very short time.
      await page.waitForTimeout(250);

      await assertion();

      await triggerMouseEvent(cellNamed(column), "mouseout");
    }

    const summarizeDataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await summarize(page);

    await page
      .getByTestId("dimension-list-item-name")
      .filter({ hasText: new RegExp(ccName) })
      .first()
      .click();

    await summarizeDataset;

    await hoverForHovercard(page, () => cellNamed("Count"));
    await expect(hovercard(page)).toContainText("Quantity");
    await expect(
      hovercard(page).getByText("No description", { exact: true }),
    ).toBeVisible();
    await triggerMouseEvent(cellNamed("Count"), "mouseout");

    // Make sure new table results loaded with Custom column and Count columns
    await hoverForHovercard(page, () => cellNamed(ccName));
    await page.waitForTimeout(250);

    await expect(hovercard(page)).toContainText("No special type");
    await expect(
      hovercard(page).getByText("No description", { exact: true }),
    ).toBeVisible();
  });

  test("should show the field metadata popover for a foreign key field (metabase#19577)", async ({
    page,
  }) => {
    await openOrdersTable(page, { limit: 2 });

    await triggerMouseEvent(
      page.getByTestId("cell-data").filter({ hasText: /Product ID/ }).first(),
      "mouseover",
    );

    await expect(hovercard(page)).toContainText("Foreign Key");
    await expect(hovercard(page)).toContainText("The product ID.");
  });

  test("should show field metadata in a hovercard when hovering over a table column in the summarize sidebar", async ({
    page,
  }) => {
    await openOrdersTable(page, { limit: 2 });

    await summarize(page);

    await page
      .getByTestId("dimension-list-item")
      .filter({ hasText: /ID/ })
      .first()
      .getByLabel("More info", { exact: true })
      .hover();

    await expect(hovercard(page)).toContainText("Entity Key");
  });

  test("should show field metadata hovercards for native query tables", async ({
    page,
  }) => {
    await startNewNativeQuestion(page, {
      query: "select * from products limit 1",
      display: "table",
    });
    await page
      .getByTestId("native-query-editor-container")
      .locator(".Icon-play")
      .click();

    // Wait for the table to load
    await expect(
      page.getByTestId("cell-data").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("cell-data").filter({ hasText: /Gizmo/ }),
    ).not.toHaveCount(0);

    // Assert
    await page
      .getByTestId("header-cell")
      .filter({ hasText: /CATEGORY/ })
      .first()
      .hover();
    await expect(hovercard(page)).toContainText("No special type");
    await expect(hovercard(page)).toContainText("No description");
  });

  test("should close the colum popover on subsequent click (metabase#16789)", async ({
    page,
  }) => {
    await openPeopleTable(page, { limit: 2 });

    await tableHeaderText(page, "City").click();
    await expect(clickActionsPopover(page)).toBeVisible();

    await tableHeaderText(page, "City").click();
    await page.waitForTimeout(100); // Ensure popover is closed
    await expect(clickActionsPopover(page)).toHaveCount(0);
  });

  test("popover should not be scrollable horizontally (metabase#31339)", async ({
    page,
  }) => {
    await openPeopleTable(page);
    await tableHeaderClick(page, "Password");

    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await selectFilterOperator(page, "Is");

    const findSuggestions = page.waitForResponse((response) =>
      /^\/api\/field\/[^/]+\/search\/[^/]+$/.test(
        new URL(response.url()).pathname,
      ),
    );
    const search = popover(page).getByPlaceholder("Search by Password", {
      exact: true,
    });
    await search.click();
    await search.pressSequentially("e");
    await findSuggestions;
    await search.blur();

    expect(await isScrollableHorizontally(popover(page))).toBe(false);
  });

  test("should show the slow loading text when the query is taking too long", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    // Upstream delays the response 10s and drives cy.clock/cy.tick past the
    // 4000ms SLOW_MESSAGE_TIMEOUT. page.clock does not freeze time, so the port
    // lets the real clock run inside the same 10s window.
    await page.route(
      (url) => new URL(url.toString()).pathname === "/api/dataset",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        await route.continue();
      },
    );

    await page.getByRole("button", { name: "Visualize", exact: true }).click();

    await expect(
      page.getByTestId("query-builder-main").getByText("Doing science...", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page
        .getByTestId("query-builder-main")
        .getByText("Waiting for results...", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("should support 'Local symbol' in 'Currency label style' viz setting", async ({
    page,
  }) => {
    await openOrdersTable(page);

    await tableHeaderClick(page, "Discount ($)");
    await icon(popover(page), "gear").click();
    await page.getByLabel("Unit of currency", { exact: true }).click();
    await page
      .getByRole("option", { name: "New Zealand Dollar", exact: true })
      .click();
    await expect(tableHeaderText(page, "Discount (NZ$)")).toBeVisible();
    await expect(
      tableInteractive(page).getByText("6.42", { exact: true }),
    ).toBeVisible();

    const localSymbol = popover(page).getByText("Local symbol ($)", {
      exact: true,
    });
    await expect(localSymbol).toBeVisible();
    await localSymbol.click();
    await expect(tableHeaderText(page, "Discount ($)")).toBeVisible();
    await expect(
      tableInteractive(page).getByText("6.42", { exact: true }),
    ).toBeVisible();

    await popover(page)
      .getByText("In every table cell", { exact: true })
      .click();
    await expect(tableHeaderText(page, "Discount")).toBeVisible();
    await expect(
      tableInteractive(page).getByText("$6.42", { exact: true }),
    ).toBeVisible();

    // should still show the option if it's already selected but currency does
    // not support it
    await page.getByLabel("Unit of currency", { exact: true }).click();
    await page
      .getByRole("option", { name: "US Dollar", exact: true })
      .click();
    await expect(
      popover(page).getByText("Local symbol ($)", { exact: true }),
    ).toBeVisible();

    // but should hide it once a valid option is selected
    await popover(page).getByText("Symbol ($)", { exact: true }).click();
    await expect(
      popover(page).getByText("Local symbol ($)", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("scenarios > visualizations > table > dashboards context", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow viewing data in dashboards", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    // Ensure it works on a regular dashboard
    await assertCanViewOrdersTableDashcard(page);

    // Ensure it works on a public dashboard
    await openSharingMenu(page, "Create a public link");
    const publicLinkInput = page.getByTestId("public-link-input");
    await expect
      .poll(() => publicLinkInput.inputValue())
      .not.toBe("");
    const publicLink = await publicLinkInput.inputValue();

    await mb.signOut();
    await page.goto(publicLink);

    await assertCanViewOrdersTableDashcard(page);
  });

  test("should allow enabling pagination in dashcard viz settings", async ({
    page,
    mb,
  }) => {
    // Page rows count is based on the available space which can differ
    // depending on the platform and scroll bar system settings
    const rowsRegex = /Rows \d+-\d+ of first 2,000/;
    const firstPageId = "6";
    const secondPageId = "12";

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    const tableDashcard = dashboardCards(page).nth(0);
    await expect(tableDashcard.getByText(rowsRegex)).toHaveCount(0);

    await expect(
      tableDashcard.getByText("Showing first 2,000 rows", { exact: true }),
    ).toBeVisible();

    // Enable pagination
    await editDashboard(page);
    await showDashcardVisualizationSettings(page, 0);
    const settingsModal = modal(page);
    await settingsModal.getByText("Paginate results", { exact: true }).click();
    await expect(settingsModal.getByText(rowsRegex)).toBeVisible();
    await settingsModal
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await saveDashboard(page);

    const idCells = page.locator('[data-column-id="ID"]');

    // Ensure pagination works
    await expect(tableDashcard.getByText(rowsRegex)).toBeVisible();
    await expectAnyCellContains(idCells, firstPageId);
    await expectNoCellContains(idCells, secondPageId);

    await page.getByLabel("Next page", { exact: true }).click();
    await expect(tableDashcard.getByText(rowsRegex)).toBeVisible();
    await expectAnyCellContains(idCells, secondPageId);
    await expectNoCellContains(idCells, firstPageId);

    await page.getByLabel("Previous page", { exact: true }).click();
    await expect(tableDashcard.getByText(rowsRegex)).toBeVisible();
    await expectAnyCellContains(idCells, firstPageId);
    await expectNoCellContains(idCells, secondPageId);

    const pageEndRow = async () => {
      const label = await tableDashcard.getByText(rowsRegex).textContent();
      return Number(/Rows \d+-(\d+) /.exec(label ?? "")![1]);
    };
    const endRowBeforeResize = await pageEndRow();

    await editDashboard(page);

    // Ensure resizing change page size
    await resizeDashboardCard(tableDashcard, { x: 600, y: 700 });
    await saveDashboard(page);
    const rowsLabel = tableDashcard.getByText(rowsRegex);
    await rowsLabel.scrollIntoViewIfNeeded();
    await expect(rowsLabel).toBeVisible();

    // Table got taller so elements from the second page have become visible.
    //
    // Upstream pins this as "ID 12 is now on page 1", but the page size is
    // derived from the dashcard's PIXEL height, so 12 is a layout-derived magic
    // number (PORTING: don't pin data-derived values, assert the behaviour).
    // Measured here: the card grows 362px → 500px and the page grows 7 rows →
    // 10 rows — the resize plainly works, row 12 just remains on page 2. The
    // drag is an absolute clientY of 700 against a card whose top is laid out by
    // the app, so the reachable height is environment-dependent.
    // Assert what the number stands for: the page got bigger, and a row that
    // was on page 2 before the resize is on page 1 now.
    const endRowAfterResize = await pageEndRow();
    expect(endRowAfterResize).toBeGreaterThan(endRowBeforeResize);
    await expectAnyCellContains(idCells, String(endRowBeforeResize + 1));
  });

  test("should display pinned rows correctly with pagination", async ({
    page,
    mb,
  }) => {
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        display: "table",
        query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
        visualization_settings: {
          "table.freeze_rows": true,
          "table.freeze_rows_count": 1,
          "table.pagination": true,
        },
      },
      cardDetails: {
        size_x: 24,
        size_y: 12,
      },
    });
    await visitDashboard(page, mb.api, dashboard_id);

    const pinnedIdCell = page
      .getByTestId("pinned-center-quadrant")
      .getByRole("row")
      .locator("[data-column-id=ID]")
      .getByTestId("cell-data");

    await expect(pinnedIdCell).toHaveText("1");

    await page.getByLabel("Next page", { exact: true }).click();

    await expect(pinnedIdCell).toHaveText("1");
  });

  test("should support text wrapping setting", async ({ page, mb }) => {
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "reviews",
        type: "model",
        query: {
          "source-table": SAMPLE_DATABASE.REVIEWS_ID,
        },
        visualization_settings: {
          "table.column_widths": [246, 195, 69, 116, 134, 83],
          column_settings: {
            '["name","BODY"]': {
              text_wrapping: true,
            },
          },
          "table.columns": [
            { name: "BODY", enabled: true },
            { name: "CREATED_AT", enabled: true },
            { name: "ID", enabled: true },
            { name: "PRODUCT_ID", enabled: true },
            { name: "REVIEWER", enabled: true },
            { name: "RATING", enabled: true },
          ],
        },
      },
      dashboardDetails: { name: "Dashboard" },
      cardDetails: { size_x: 24, size_y: 12 },
    });

    const wrappedRowInitialHeight = 87;
    const updatedRowHeight = 70;
    await visitDashboard(page, mb.api, dashboard_id);

    await assertRowHeight(page, 0, wrappedRowInitialHeight);

    await resizeTableColumn(page, "BODY", 100);

    // Ensure resizing led to the reduction of the row height
    await assertRowHeight(page, 0, updatedRowHeight);

    // Ensure resizing did not permanently changed the row height
    await page.reload();
    await assertRowHeight(page, 0, wrappedRowInitialHeight);

    // Disable text wrapping from dashcard settings
    await editDashboard(page);

    await showDashcardVisualizationSettings(page, 0);

    await page.getByTestId("Body-settings-button").click();

    await popover(page).getByText("Wrap text", { exact: true }).click();

    await page.getByRole("button", { name: "Done", exact: true }).click();

    // Ensure rows have fixed default height
    await assertRowHeight(page, 0, 36);
  });

  test("should update row heights correctly when sorting with text wrapping enabled (metabase#61164)", async ({
    page,
    mb,
  }) => {
    // This test verifies that when sorting changes, row heights are recalculated
    // based on the new row content at each position (not the old cached heights)
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "reviews for sorting test",
        type: "model",
        query: {
          "source-table": SAMPLE_DATABASE.REVIEWS_ID,
          limit: 10,
        },
        visualization_settings: {
          "table.column_widths": [200, 100, 100, 100, 100],
          column_settings: {
            '["name","BODY"]': {
              text_wrapping: true,
            },
          },
          "table.columns": [
            { name: "BODY", enabled: true },
            { name: "RATING", enabled: true },
            { name: "ID", enabled: true },
            { name: "PRODUCT_ID", enabled: true },
            { name: "REVIEWER", enabled: true },
          ],
        },
      },
      dashboardDetails: { name: "Dashboard" },
      cardDetails: { size_x: 24, size_y: 12 },
    });

    await visitDashboard(page, mb.api, dashboard_id);

    const assertRowsDoNotOverlap = async () => {
      const rects = await tableInteractiveBody(page)
        .locator("[role=row]")
        .evaluateAll((rows) =>
          rows
            .map((row) => {
              const { top, bottom } = row.getBoundingClientRect();
              return { top, bottom };
            })
            .sort((a, b) => a.top - b.top),
        );

      // Each row's top should equal the previous row's bottom (no overlap)
      for (let i = 1; i < rects.length; i++) {
        expect(Math.abs(rects[i].top - rects[i - 1].bottom)).toBeLessThanOrEqual(
          0.001,
        );
      }
    };

    // Wait for table to render, then sort and verify rows don't overlap
    await expect(
      tableInteractive(page).locator('[data-index="0"]').first(),
    ).toBeAttached();

    await tableHeaderClick(page, "Rating");
    await assertRowsDoNotOverlap();

    // Sort again (descending) to verify heights update on subsequent sorts
    await tableHeaderClick(page, "Rating");
    await assertRowsDoNotOverlap();
  });

  test("should support the row index setting", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await showDashcardVisualizationSettings(page, 0);
    await modal(page).getByText("Display", { exact: true }).click();
    await modal(page).getByText("Show row index", { exact: true }).click();

    await page.getByRole("button", { name: "Done", exact: true }).click();

    await saveDashboard(page);

    await expect(
      tableInteractiveBody(page).getByTestId("row-id-cell").nth(0),
    ).toHaveText("1");

    // Apply sorting to ensure row index does not change
    await tableHeaderClick(page, "ID");

    await expect(
      tableInteractiveBody(page).getByTestId("row-id-cell").nth(0),
    ).toHaveText("1");
  });

  test("should sort pinned rows correctly with client-side sorting", async ({
    page,
    mb,
  }) => {
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        display: "table",
        query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
        visualization_settings: {
          "table.freeze_rows": true,
          "table.freeze_rows_count": 1,
        },
      },
      cardDetails: { size_x: 24, size_y: 12 },
    });
    await visitDashboard(page, mb.api, dashboard_id);

    const pinnedIdCell = page
      .getByTestId("pinned-center-quadrant")
      .getByRole("row")
      .locator("[data-column-id=ID]")
      .getByTestId("cell-data");

    await expect(pinnedIdCell).toHaveText("1");

    await tableHeaderClick(page, "ID");

    await expect(pinnedIdCell).toHaveText("2000");

    await tableHeaderClick(page, "ID");

    await expect(pinnedIdCell).toHaveText("1");
  });

  test("should expand columns to the full width of the dashcard (metabase#57381)", async ({
    page,
    mb,
  }) => {
    const sideColumnsWidth = 200;
    const expandedSideColumnsWidth = 2 * sideColumnsWidth;
    const idColumnWidth = 54;
    const idExpandedWidth = 2 * idColumnWidth;

    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "reviews",
        type: "model",
        query: {
          "source-table": SAMPLE_DATABASE.REVIEWS_ID,
        },
        visualization_settings: {
          // middle column width is not set
          "table.column_widths": [sideColumnsWidth, null, sideColumnsWidth],
          column_settings: {
            '["name","BODY"]': {
              text_wrapping: true,
            },
          },
          "table.columns": [
            { name: "BODY", enabled: true },
            { name: "CREATED_AT", enabled: false },
            { name: "ID", enabled: true },
            { name: "PRODUCT_ID", enabled: false },
            { name: "REVIEWER", enabled: false },
            { name: "RATING", enabled: true },
          ],
        },
      },
      dashboardDetails: { name: "Dashboard" },
      cardDetails: { size_x: 24, size_y: 12 },
    });

    await visitDashboard(page, mb.api, dashboard_id);

    // Column widths should be expanded to the full width of the dashcard
    expect(await getColumnWidth(page, "Body")).toBeGreaterThan(
      expandedSideColumnsWidth,
    );
    expect(await getColumnWidth(page, "Rating")).toBeGreaterThan(
      expandedSideColumnsWidth,
    );
    expect(await getColumnWidth(page, "ID")).toBeGreaterThan(idExpandedWidth);

    // Resize Body column
    await resizeTableColumn(page, "BODY", -100);

    // Ensure columns are not expanded to the full width of the dashcard after
    // manual resizing
    const bodyWidth = await getColumnWidth(page, "Body");
    expect(bodyWidth).toBeGreaterThan(expandedSideColumnsWidth - 100);
    expect(bodyWidth).toBeLessThan(expandedSideColumnsWidth);
    expect(await getColumnWidth(page, "Rating")).toBeGreaterThan(
      expandedSideColumnsWidth,
    );
    expect(await getColumnWidth(page, "ID")).toBeGreaterThan(idExpandedWidth);
  });

  test("should support resizing columns in dashcard viz settings", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    // `:contains(ID)` is a case-sensitive substring and also matches "User ID"
    // / "Product ID"; Cypress reads the FIRST match.
    const headerCell = headerCells(page).filter({ hasText: /ID/ }).first();
    await expect(headerCell).toBeVisible();
    const originalWidth = (await headerCell.boundingBox())!.width;

    await editDashboard(page);

    await showDashcardVisualizationSettings(page, 0);

    const resizeByWidth = 100;
    await resizeTableColumn(page, "ID", resizeByWidth, 1);

    await modal(page).getByText("Done", { exact: true }).click();

    await saveDashboard(page);

    await expect
      .poll(async () => (await headerCell.boundingBox())!.width)
      .toBeGreaterThanOrEqual(originalWidth + resizeByWidth);

    // Ensure it persists after page reload
    await page.reload();

    await expect
      .poll(async () => (await headerCell.boundingBox())!.width)
      .toBeGreaterThanOrEqual(originalWidth + resizeByWidth);
  });
});

test.describe("scenarios > visualizations > table > conditional formatting", () => {
  test.describe("rules", () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      await visitQuestionAdhoc(page, {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
          },
          type: "query",
        },
        visualization_settings: {
          "table.column_formatting": [
            {
              id: 0,
              type: "single",
              operator: "<",
              value: 3,
              color: "#509EE3",
              highlight_row: false,
              columns: ["TAX"],
            },
            {
              id: 1,
              type: "single",
              operator: "<",
              value: 6,
              color: "#88BF4D",
              highlight_row: false,
              columns: ["TAX"],
            },
            {
              id: 2,
              type: "single",
              operator: "<",
              value: 10,
              color: "#EF8C8C",
              highlight_row: false,
              columns: ["TAX"],
            },
          ],
        },
      });

      await openVizSettingsSidebar(page);
      await sidebar(page)
        .getByText("Conditional Formatting", { exact: true })
        .click();
    });

    test("should be able to remove, add, and re-order rows", async ({
      page,
    }) => {
      const rulePreviews = page.getByTestId("formatting-rule-preview");

      await expect(rulePreviews.first()).toContainText("is less than 3");
      await rulePreviews
        .first()
        .getByRole("img", { name: /close/ })
        .click();

      await expect(rulePreviews.first()).toContainText("is less than 6");

      await page
        .getByRole("button", { name: /add a rule/i })
        .click();
      // popover should open automatically
      await popover(page).getByText("Subtotal", { exact: true }).click();
      // `cy.realPress("Escape")` reaches the combobox input (where Mantine's
      // `useCombobox` listens); `page.keyboard.press` types at
      // document.activeElement, which the option click can leave on <body>, so
      // the dropdown stayed open. It renders inline (`withinPortal: false`)
      // directly over the operator Select, so the next force-click landed on an
      // option ("Total") instead — a silent second column, not an error.
      await page
        .getByRole("textbox", { name: "Choose a column" })
        .press("Escape");
      await expect(page.getByRole("listbox")).toHaveCount(0);
      // Upstream's `.click({ force: true })` is a DISPATCH at the resolved
      // element; Playwright's force-click moves the real mouse and hits whatever
      // is topmost there, so port it as dispatchEvent.
      await page
        .getByTestId("conditional-formatting-value-operator-button")
        .dispatchEvent("click");
      await popover(page).getByText("is less than", { exact: true }).click();

      const valueInput = page.getByTestId(
        "conditional-formatting-value-input",
      );
      await valueInput.click();
      await valueInput.press("End");
      await valueInput.pressSequentially("20");
      await page.getByTestId("conditional-formatting-color-selector").click();

      await popover(page)
        .getByRole("button", { name: /#F2A86F/i })
        .click();

      await page.getByRole("button", { name: "Add rule", exact: true }).click();

      await expect(rulePreviews.first()).toContainText("is less than 20");

      await moveDnDKitElementVertically(rulePreviews.nth(2), -300);

      await expect(rulePreviews.first()).toContainText("is less than 10");
    });
  });

  test.describe("operators", () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore("postgres-writable");
      await resetTestTable({ type: "postgres", table: "many_data_types" });
      await mb.signInAsAdmin();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: ["many_data_types"],
      });

      const { id: tableId, fields } = await getWritableTable(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "many_data_types",
      });
      const booleanField = fields.find((field) => field.name === "boolean")!;
      const stringField = fields.find((field) => field.name === "string")!;
      const idField = fields.find((field) => field.name === "id")!;

      await visitQuestionAdhoc(page, {
        dataset_query: {
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            fields: [
              ["field", idField.id, { "base-type": idField.base_type }],
              ["field", stringField.id, { "base-type": stringField.base_type }],
              [
                "field",
                booleanField.id,
                { "base-type": booleanField.base_type },
              ],
            ],
          },
          type: "query",
        },
        display: "table",
      });
    });

    test("should work with boolean columns", async ({ page }) => {
      await openVizSettingsSidebar(page);
      await leftSidebar(page)
        .getByText("Conditional Formatting", { exact: true })
        .click();
      await page.getByRole("button", { name: /add a rule/i }).click();

      await popover(page)
        .getByRole("option", { name: "Boolean", exact: true })
        .click();

      // Dismiss popover
      await leftSidebar(page)
        .getByText("Which columns should be affected?", { exact: true })
        .click();

      // Check that is-true was applied by default to boolean field rule
      await expect(
        page.getByTestId("conditional-formatting-value-operator-button"),
      ).toHaveValue("is true");

      await expect(
        tableInteractiveBody(page)
          .getByRole("gridcell", { name: "true", exact: true })
          .getByTestId("body-cell-container"),
      ).toHaveCSS("background-color", "rgba(80, 158, 227, 0.65)");
    });
  });
});

test.describe("scenarios > visualizations > table > with tracking", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // H.resetSnowplow() + H.enableTracking(): the capture forces the tracker on
    // at the browser boundary and starts with an empty event list.
    snowplow = await installSnowplowCapture(page, mb.baseUrl);
    snowplow.reset();
  });

  test.afterEach(async () => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test("should track when freeze columns is enabled from viz settings", async ({
    page,
  }) => {
    await openOrdersTable(page);
    await openVizSettingsSidebar(page);
    await sidebar(page).getByText("Display", { exact: true }).click();

    await sidebar(page).getByText("Freeze columns", { exact: true }).click();

    // Toggling off should not emit the enabled event again
    await sidebar(page).getByText("Freeze columns", { exact: true }).click();
    await expectUnstructuredSnowplowEvent(
      snowplow,
      {
        event: "table_freeze_columns_enabled",
        triggered_from: "viz_settings",
      },
      1,
    );
  });

  test("should track when freeze rows is enabled from viz settings", async ({
    page,
  }) => {
    await openOrdersTable(page);
    await openVizSettingsSidebar(page);
    await sidebar(page).getByText("Display", { exact: true }).click();

    await sidebar(page).getByText("Freeze rows", { exact: true }).click();

    // Toggling off should not emit the enabled event again
    await sidebar(page).getByText("Freeze rows", { exact: true }).click();
    await expectUnstructuredSnowplowEvent(
      snowplow,
      {
        event: "table_freeze_rows_enabled",
        triggered_from: "viz_settings",
      },
      1,
    );
  });
});

test.describe("scenarios > visualizations > table > time formatting (#11398)", () => {
  const singleTimeQuery = `
      WITH t1 AS (SELECT TIMESTAMP '2023-01-01 18:34:00' AS time_value),
           t2 AS (SELECT CAST(time_value AS TIME) AS creation_time
                  FROM t1)
      SELECT *
      FROM t2;
  `;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should work with time columns", async ({ page, mb }) => {
    // Upstream tags this `@external`, so it is gated the same way even though
    // the query runs against the H2 sample database and needs no container.
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

    const { id } = await createNativeQuestion(mb.api, {
      name: "11398",
      native: { query: singleTimeQuery },
    });
    await visitQuestion(page, id);

    // Open the formatting menu
    await tableHeaderClick(page, "CREATION_TIME");

    await icon(popover(page), "gear").click();

    const formatting = page.getByTestId("column-formatting-settings");
    // Set to hours, minutes, seconds, 24-hour clock
    await formatting.getByText("HH:MM:SS", { exact: true }).click();
    await formatting
      .getByText("17:24 (24-hour clock)", { exact: true })
      .click();

    // And you should find the result
    await expect(
      page.getByRole("gridcell", { name: "18:34:00", exact: true }),
    ).toBeVisible();

    // Add millisecond display and change back to 12 hours
    await formatting.getByText("HH:MM:SS.MS", { exact: true }).click();
    await formatting
      .getByText("5:24 PM (12-hour clock)", { exact: true })
      .click();

    // And you should find the result
    await expect(
      page.getByRole("gridcell", { name: "6:34:00.000 PM", exact: true }),
    ).toBeVisible();
  });

  test("should preserve DOM elements for visible rows during scrolling", async ({
    page,
  }) => {
    await openOrdersTable(page);

    const targetDatasetIndex = 15;

    const row = tableInteractiveBody(page)
      .locator(`[role=row][data-dataset-index="${targetDatasetIndex}"]`)
      .first();
    await expect(row).toBeAttached();

    const rowHandle = await row.elementHandle();

    await page.getByTestId("table-scroll-container").evaluate((el, index) => {
      el.scrollTop = el.scrollTop + 36 * (index - 1);
    }, targetDatasetIndex);

    const rowAfterScroll = tableInteractiveBody(page)
      .locator(`[role=row][data-dataset-index="${targetDatasetIndex}"]`)
      .first();
    await expect(rowAfterScroll).toBeAttached();

    // Row has always been visible so it should use the same html node
    const isSameNode = await rowAfterScroll.evaluate(
      (el, original) => el === original,
      rowHandle,
    );
    expect(isSameNode).toBe(true);
  });
});
