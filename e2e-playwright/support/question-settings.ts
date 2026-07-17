/**
 * Helpers for the question settings spec port
 * (e2e/test/scenarios/question/settings.cy.spec.js):
 * - openOrdersTable / browseDatabases (`H` helpers not yet in shared modules)
 * - the in-spec sidebar-column helpers (getSidebarColumns,
 *   getVisibleSidebarColumns, hideColumn)
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9).
 */
import type { Locator, Page } from "@playwright/test";

import { openTable } from "./binning";
import { sidebar } from "./dashboard";
import { expect } from "./fixtures";
import { SAMPLE_DATABASE } from "./sample-data";
import { navigationSidebar } from "./ui";

/** Port of H.openOrdersTable (simple mode only — all this spec needs). */
export async function openOrdersTable(page: Page) {
  await openTable(page, { table: SAMPLE_DATABASE.ORDERS_ID });
}

/** Port of H.browseDatabases. */
export function browseDatabases(page: Page): Locator {
  return navigationSidebar(page).getByLabel("Browse databases", {
    exact: true,
  });
}

/**
 * Port of the spec's getSidebarColumns: all column rows (visible and
 * hidden) in the table-columns section of the viz settings sidebar. The
 * Cypress helper scrollIntoView'd the container first.
 */
export async function getSidebarColumns(page: Page): Promise<Locator> {
  const container = page.getByTestId("chart-settings-table-columns");
  await container.scrollIntoViewIfNeeded();
  await expect(container).toBeVisible();
  return container.getByRole("listitem");
}

/** Port of the spec's getVisibleSidebarColumns. */
export function getVisibleSidebarColumns(page: Page): Locator {
  return page.getByTestId("visible-columns").getByRole("listitem");
}

/**
 * Port of the spec's findColumnAtIndex (negative indices count from the
 * end, like Cypress .eq). The count + nth pair is re-resolved until the
 * assertion holds, mirroring Cypress's retry of the whole query chain.
 */
export async function findColumnAtIndex(
  page: Page,
  columnName: string,
  index: number,
): Promise<Locator> {
  const columns = getVisibleSidebarColumns(page);
  const resolve = async () => {
    const count = await columns.count();
    return columns.nth(index < 0 ? count + index : index);
  };
  await expect(async () => {
    await expect(await resolve()).toContainText(columnName, { timeout: 1000 });
  }).toPass();
  return resolve();
}

/**
 * Synthetic-event port of H.moveDnDKitElementByAlias({ useMouseEvents }) for
 * drag targets that sit below the scroll container's fold: a real mouse
 * press on clipped coordinates lands on whatever covers them and the drag
 * never starts, while Cypress's trigger() dispatches straight on the
 * element. Mirrors the Cypress sequence exactly — mousedown at the
 * element's top-left, a 20,20 activation move, a move to the offset, and a
 * document-level mouseup, with 200ms pauses so dnd-kit's autoscroller gets
 * time to run.
 */
export async function moveDnDKitElementSynthetic(
  element: Locator,
  { horizontal = 0, vertical = 0 }: { horizontal?: number; vertical?: number },
) {
  await element.evaluate(
    async (el, { horizontal, vertical }) => {
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const options = { bubbles: true, cancelable: true, button: 0 };
      const { x, y } = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("mousedown", { ...options, clientX: x, clientY: y }),
      );
      await sleep(200);
      // This initial move needs to be greater than the activation
      // constraint of the sensor.
      el.dispatchEvent(
        new MouseEvent("mousemove", {
          ...options,
          clientX: x + 20,
          clientY: y + 20,
        }),
      );
      await sleep(200);
      el.dispatchEvent(
        new MouseEvent("mousemove", {
          ...options,
          clientX: x + horizontal,
          clientY: y + vertical,
        }),
      );
      await sleep(200);
      document.dispatchEvent(
        new MouseEvent("mouseup", {
          ...options,
          clientX: x + horizontal,
          clientY: y + vertical,
        }),
      );
      await sleep(200);
    },
    { horizontal, vertical },
  );
}

/**
 * Port of the spec's hideColumn. Like the Cypress original, no force —
 * let actionability checks wait out re-renders.
 */
export async function hideColumn(page: Page, name: string) {
  await sidebar(page)
    .getByTestId(`draggable-item-${name}`)
    .getByTestId(`${name}-hide-button`)
    .click();
}
