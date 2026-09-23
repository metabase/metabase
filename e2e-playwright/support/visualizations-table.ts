/**
 * Helpers for the visualizations-table spec port
 * (e2e/test/scenarios/visualizations-tabular/table.cy.spec.js).
 *
 * New module per PORTING rule 9 — shared support modules are imported
 * read-only. Consolidation candidates flagged inline.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { tableInteractiveHeader } from "./table-column-settings";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of the spec-local `headerCells()` — `cy.findAllByTestId("header-cell")`.
 *
 * Upstream's is page-wide; this one is scoped to `table-header`, which is what
 * every Cypress *helper* that reaches for a header cell already does
 * (`H.tableInteractiveHeader`). PORTING records that a page-wide header-cell
 * locator is a latent strict-mode flake (a second table — object-detail column,
 * pivot sub-table — reddened dashboard-drill on CI). Every call site here runs
 * against a single result table, so the scoped locator resolves to exactly the
 * same set, ordered the same way (`.eq(n)` indices are preserved).
 */
export function headerCells(page: Page): Locator {
  return tableInteractiveHeader(page).getByTestId("header-cell");
}

/**
 * Port of `H.tableHeaderColumn(name)` — note it returns the `findByText`
 * element *inside* the header cell, not the cell. That element is the dnd-kit
 * drag target (`SortableHeader`'s inner content div), which is why
 * `moveDnDKitElementByAlias` is aliased off it upstream.
 *
 * `filter({ visible: true })`: react-virtualized renders a `visibility:hidden`
 * off-screen measurement clone of the header row (x ≈ -9959), so an unfiltered
 * locator can resolve to a node with no usable bounding box.
 */
export function tableHeaderText(page: Page, name: string): Locator {
  return tableInteractiveHeader(page)
    .getByText(name, { exact: true })
    .filter({ visible: true })
    .first();
}

/**
 * Port of `H.getColumnWidth(columnId)` —
 * `findAllByTestId("header-cell").filter(":contains(id)").invoke("width")`.
 * jQuery `.width()` is the CONTENT width (box-sizing aside), so read
 * `clientWidth` minus horizontal padding rather than the border-box
 * `boundingBox().width`.
 *
 * Scoped to `table-header` for the same reason `headerCells` is.
 */
export async function getColumnWidth(
  page: Page,
  columnId: string,
): Promise<number> {
  const cell = headerCells(page)
    .filter({ hasText: new RegExp(escapeRegExp(columnId)) })
    .first();
  await expect(cell).toBeVisible();
  return cell.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return (
      el.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  });
}

/**
 * Port of `H.tableHeaderColumn(x).invoke("outerWidth")` — jQuery `.outerWidth()`
 * is the border-box width, i.e. `getBoundingClientRect().width`.
 */
export async function outerWidth(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("outerWidth: element has no bounding box");
  }
  return box.width;
}

type ScrollCorner = "topLeft" | "bottomLeft" | "bottomRight";

/**
 * Port of `H.tableInteractiveScrollContainer().scrollTo(corner)`. Cypress's
 * `scrollTo` without a `duration` is an instant jump, so assigning
 * scrollTop/scrollLeft is faithful (and sidesteps the reduced-motion
 * smooth-scroll trap). Direct assignment does drive this container — unlike the
 * react-virtualized `ScrollSync` grids in pivot tables.
 */
export async function scrollTableTo(page: Page, corner: ScrollCorner) {
  await page.getByTestId("table-scroll-container").evaluate((el, corner) => {
    el.scrollTop = corner === "topLeft" ? 0 : el.scrollHeight;
    el.scrollLeft = corner === "bottomRight" ? el.scrollWidth : 0;
  }, corner);
}

/**
 * Cypress `.trigger(type, ...)` is a synthetic event dispatch at the element's
 * center — NOT a real mouse move (PORTING, wave 13). Reproduce it, including
 * the client coordinates Cypress computes, so handlers that hit-test by
 * coordinate behave the same.
 */
export async function triggerMouseEvent(
  locator: Locator,
  type: string,
  init: Record<string, unknown> = {},
) {
  await expect(locator).toBeVisible();
  // Read the rect INSIDE the evaluate: `boundingBox()` is a separate round trip
  // that returns null if the table re-renders in between (measured — it did,
  // right after the summarize re-query), which reads as "the element vanished".
  await locator.evaluate(
    (el, args) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent(args.type, {
          bubbles: true,
          cancelable: true,
          clientX: x + width / 2,
          clientY: y + height / 2,
          ...args.init,
        }),
      );
    },
    { type, init },
  );
}

/**
 * Port of `cy.get(sel).should("contain", value)` on a MULTI-element subject:
 * chai-jquery resolves `contain` to `$el.is(":contains(value)")` and jQuery's
 * `.is()` is true when ANY element matches (PORTING rule 3). So this is an
 * "at least one" assertion, and its negation is "none".
 */
export async function expectAnyCellContains(cells: Locator, value: string) {
  await expect(
    cells.filter({ hasText: new RegExp(escapeRegExp(value)) }),
  ).not.toHaveCount(0);
}

export async function expectNoCellContains(cells: Locator, value: string) {
  await expect(
    cells.filter({ hasText: new RegExp(escapeRegExp(value)) }),
  ).toHaveCount(0);
}

/**
 * Port of the spec-local `assertClientSideTableSorting`. `columnName` is the
 * display name, `columnId` the `data-column-id`. Each `should("have.text", n)`
 * is compared as a string (the cell's textContent).
 */
export async function assertClientSideTableSorting(
  page: Page,
  {
    columnName,
    columnId,
    descValue,
    ascValue,
    defaultValue,
  }: {
    columnName: string;
    columnId: string;
    descValue: string;
    ascValue: string;
    defaultValue: string;
  },
) {
  await scrollTableTo(page, "topLeft");

  const firstRowCell = () =>
    page
      .getByTestId("table-body")
      .getByRole("row")
      .first()
      .locator(`[data-column-id=${columnId}]`);

  await expect(firstRowCell()).toHaveText(defaultValue);

  // Descending
  await tableHeaderClickScoped(page, columnName);
  await expect(
    columnHeaderOf(page, columnName).getByLabel("chevrondown icon", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(firstRowCell()).toHaveText(descValue);

  // Ascending
  await tableHeaderClickScoped(page, columnName);
  await expect(
    columnHeaderOf(page, columnName).getByLabel("chevronup icon", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(firstRowCell()).toHaveText(ascValue);

  // Back to default
  await tableHeaderClickScoped(page, columnName);
  await expect(columnHeaderOf(page, columnName).getByRole("img")).toHaveCount(0);
  await expect(firstRowCell()).toHaveText(defaultValue);
}

/**
 * `H.tableHeaderColumn(name).closest("[role=columnheader]")`.
 */
export function columnHeaderOf(page: Page, name: string): Locator {
  return tableHeaderText(page, name).locator(
    'xpath=ancestor-or-self::*[@role="columnheader"][1]',
  );
}

/** `H.tableHeaderClick(name)` on the header text (see notebook.ts). */
export async function tableHeaderClickScoped(page: Page, name: string) {
  await tableHeaderText(page, name).click();
}

/**
 * Port of the spec-local `assertCanViewOrdersTableDashcard`. Called once on the
 * app dashboard and once on its public link.
 */
export async function assertCanViewOrdersTableDashcard(page: Page) {
  const table = page.getByTestId("table-root");
  const body = page.getByTestId("table-body");

  await expect(body.getByRole("row").first()).toBeVisible();
  await expect(table).toHaveAttribute("data-rows-count", "2000");

  await scrollTableTo(page, "bottomLeft");
  await expect(
    body.getByRole("row").last().getByRole("gridcell").first(),
  ).toHaveText("2000"); // Last Order ID

  await scrollTableTo(page, "bottomRight");
  await expect(
    body.getByRole("row").last().getByRole("gridcell").last(),
  ).toHaveText("9"); // Quantity of the last Order

  await assertClientSideTableSorting(page, {
    columnName: "ID",
    columnId: "ID",
    defaultValue: "1",
    descValue: "2000",
    ascValue: "1",
  });

  await assertClientSideTableSorting(page, {
    columnName: "Created At",
    columnId: "CREATED_AT",
    defaultValue: "February 11, 2028, 9:40 PM",
    descValue: "April 19, 2029, 2:07 PM",
    ascValue: "June 1, 2025, 6:12 PM",
  });
}

/**
 * Port of `H.getTable({ name })` (e2e-qa-databases-helpers.js): the writable
 * database's metadata entry for a table, including its fields. schema-viewer.ts
 * ports `getTableId` but not this shape (it needs `fields`).
 */
export async function getWritableTable(
  api: MetabaseApi,
  { databaseId, name }: { databaseId: number; name: string },
): Promise<{ id: number; fields: { id: number; name: string; base_type: string }[] }> {
  const response = await api.get(`/api/database/${databaseId}/metadata`);
  const body = (await response.json()) as {
    tables?: {
      id: number;
      name: string;
      fields: { id: number; name: string; base_type: string }[];
    }[];
  };
  const table = body.tables?.find((table) => table.name === name);
  if (!table) {
    throw new Error(`Table ${name} not found on database ${databaseId}`);
  }
  return table;
}

/**
 * Dispatch `mouseover` and wait for the field-metadata hovercard, re-nudging if
 * it does not open.
 *
 * Needed only after a re-query: the summarize round-trip replaces the header
 * nodes, and a single synthetic mouseover that lands while React is swapping
 * them is simply lost — the hovercard never opens and the (retrying) assertion
 * has nothing to wait for. Cypress's command queue supplied the settle for
 * free. This is the same re-nudge pattern PORTING documents for editor
 * autocomplete.
 */
export async function hoverForHovercard(page: Page, target: () => Locator) {
  const card = page
    .locator(".mb-mantine-HoverCard-dropdown[role='dialog']")
    .filter({ visible: true });
  await expect(async () => {
    await triggerMouseEvent(target(), "mouseover");
    await expect(card).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}
