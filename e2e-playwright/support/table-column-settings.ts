/**
 * Helpers for the table-column-settings spec port
 * (e2e/test/scenarios/visualizations-tabular/table-column-settings.cy.spec.js).
 *
 * Kept in its own module per the porting rules (parallel agents never edit
 * shared support files). Consolidation candidates flagged inline:
 * - `tableInteractiveBody` / `tableInteractiveScrollContainer` are trivial
 *   testid wrappers that belong next to models.ts#tableInteractive.
 * - `assertRowHeight` / `openColumnOptions` overlap the models-metadata /
 *   ui-elements helper surface.
 * - `moveDnDKitColumnHeader` is the column-header (SortableHeader) variant of
 *   the synthetic-pointer dnd mover already in pivot-tables.ts#moveDnDKitPointer.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { tableInteractive } from "./models";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Port of H.tableInteractiveBody() — cy.findByTestId("table-body"). */
export function tableInteractiveBody(page: Page): Locator {
  return page.getByTestId("table-body");
}

/** Port of H.tableInteractiveHeader() — cy.findByTestId("table-header"). */
export function tableInteractiveHeader(page: Page): Locator {
  return page.getByTestId("table-header");
}

/** Port of H.tableInteractiveScrollContainer() — the horizontal scroll box. */
export function tableInteractiveScrollContainer(page: Page): Locator {
  return page.getByTestId("table-scroll-container");
}

/** The spec-local visibleColumns() — cy.findByTestId("visible-columns"). */
export function visibleColumns(page: Page): Locator {
  return page.getByTestId("visible-columns");
}

/**
 * Port of the spec-local getColumn: `visibleColumns().contains("[role=listitem]",
 * columnName)`. Cypress `.contains` is a case-sensitive substring returning the
 * first DOM match, so this filters the list items by a case-sensitive substring
 * regex and takes the first.
 */
export function getColumn(page: Page, columnName: string): Locator {
  return visibleColumns(page)
    .locator("[role=listitem]")
    .filter({ hasText: new RegExp(escapeRegExp(columnName)) })
    .first();
}

/** Port of the spec-local assertColumnEnabled. */
export async function assertColumnEnabled(column: Locator) {
  await expect(column).toHaveAttribute("data-enabled", "true");
}

/** Port of the spec-local assertColumnHidden. */
export async function assertColumnHidden(column: Locator) {
  await expect(column).toHaveAttribute("data-enabled", "false");
}

/** Port of the spec-local showColumn: click `${column}-show-button`. */
export async function showColumn(page: Page, column: string) {
  await page.getByTestId(`${column}-show-button`).click();
}

/** Port of the spec-local hideColumn: click `${column}-hide-button`. */
export async function hideColumn(page: Page, column: string) {
  await page.getByTestId(`${column}-hide-button`).click();
}

/**
 * Port of the spec-local scrollVisualization (default position "right"):
 * H.tableInteractiveScrollContainer().scrollTo("right", { force: true }).
 * Cypress's scrollTo without a duration is an instant jump, so setting
 * scrollLeft directly is faithful (and dodges the reduced-motion smooth-scroll
 * gotcha). The caller repeats it `scrollTimes` times as the original did.
 */
export async function scrollVisualizationRight(page: Page) {
  await tableInteractiveScrollContainer(page).evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
}

/**
 * Port of H.openColumnOptions (e2e-models-metadata-helpers.js): scroll the
 * interactive table into view, then click the header cell whose text matches
 * `column` exactly to open its column popover.
 */
export async function openColumnOptions(page: Page, column: string) {
  const ti = tableInteractive(page);
  await expect(ti.getByTestId("header-cell").first()).toBeVisible();
  await ti.scrollIntoViewIfNeeded();
  await expect(ti).toBeVisible();
  await ti
    .getByTestId("header-cell")
    .filter({ hasText: new RegExp(`^${escapeRegExp(column)}$`) })
    .first()
    .getByText(column, { exact: true })
    .first()
    .click();
}

/**
 * Port of H.assertRowHeight(index, height): the row at [data-index=index] has
 * the given CSS pixel height.
 */
export async function assertRowHeight(page: Page, index: number, height: number) {
  // The row at a given data-index is rendered in both the pinned and unpinned
  // body quadrants, so the locator matches two nodes. Cypress's `.find().should
  // ("have.css", ...)` reads the first element's height; take the first here too
  // (both quadrants share the row height the test is about).
  await expect(
    tableInteractive(page).locator(`[data-index="${index}"]`).first(),
  ).toHaveCSS("height", `${height}px`);
}

/**
 * The drag target for a column header reorder. H.tableHeaderColumn returns the
 * `findByText` element *inside* the header cell — that is where the pointer
 * events must originate, because dnd-kit's PointerSensor listeners live on the
 * SortableHeader's inner `headerContent` div (a pointerdown on the outer
 * `header-cell` would not bubble down to it). Verified against SortableHeader.tsx.
 */
export function columnHeaderDragHandle(page: Page, name: string): Locator {
  return tableInteractiveHeader(page)
    .getByText(name, { exact: true })
    .first();
}

/**
 * Port of H.moveDnDKitElementByAlias for the interactive table's column-reorder
 * headers. dnd-kit's PointerSensor (activationConstraint distance 10, see
 * use-columns-reordering.tsx) accepts synthetic pointer events; the Cypress
 * helper drives it by firing pointerdown at the element's top-left (0,0), a
 * threshold-exceeding move at (20,20), the offset move at (horizontal, vertical)
 * — all element-relative — then pointerup on document. It re-queries the element
 * before every event (the header remounts/transforms mid-drag), so this re-reads
 * the bounding box each time and fires relative to the current top-left.
 */
export async function moveDnDKitColumnHeader(
  element: Locator,
  { horizontal = 0, vertical = 0 }: { horizontal?: number; vertical?: number },
) {
  const page = element.page();

  const dispatch = (
    type: string,
    clientX: number,
    clientY: number,
    onDocument = false,
  ) =>
    element.evaluate(
      (el, args) => {
        const target = args.onDocument ? document : el;
        target.dispatchEvent(
          new PointerEvent(args.type, {
            bubbles: true,
            cancelable: true,
            clientX: args.clientX,
            clientY: args.clientY,
            button: 0,
            buttons: args.type === "pointerup" ? 0 : 1,
            isPrimary: true,
            pointerId: 1,
          }),
        );
      },
      { type, clientX, clientY, onDocument },
    );

  const boxAt = async () => {
    const box = await element.boundingBox();
    if (!box) {
      throw new Error("moveDnDKitColumnHeader: missing bounding box");
    }
    return box;
  };

  let box = await boxAt();
  await dispatch("pointerdown", box.x, box.y);
  await page.waitForTimeout(200);

  box = await boxAt();
  await dispatch("pointermove", box.x + 20, box.y + 20);
  await page.waitForTimeout(200);

  box = await boxAt();
  const finalX = box.x + horizontal;
  const finalY = box.y + vertical;
  await dispatch("pointermove", finalX, finalY);
  await page.waitForTimeout(200);

  await dispatch("pointerup", finalX, finalY, true);
  await page.waitForTimeout(200);
}
