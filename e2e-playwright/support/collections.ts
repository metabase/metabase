/**
 * Helpers for the collection spec ports: ports of
 * e2e/support/helpers/e2e-collection-helpers.ts (pinned/unpinned sections and
 * their item menus) and e2e-dragndrop-helpers.js.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { icon } from "./dashboard-cards";

/** Port of H.getPinnedSection. */
export function getPinnedSection(page: Page): Locator {
  return page.getByTestId("pinned-items");
}

/** Port of H.getUnpinnedSection. */
export function getUnpinnedSection(page: Page): Locator {
  return page.getByRole("table");
}

/** Port of H.openPinnedItemMenu: hover the pinned card, then open Actions. */
export async function openPinnedItemMenu(page: Page, name: string) {
  // Mirror of the Cypress `.closest("a")`: the pinned card link containing
  // the item name.
  const pinnedItem = getPinnedSection(page)
    .locator("a")
    .filter({ has: page.getByText(name, { exact: true }) });
  await pinnedItem.hover();
  await pinnedItem.getByLabel("Actions", { exact: true }).click();
}

/** Port of H.openUnpinnedItemMenu: the row ellipsis is hover-gated. */
export async function openUnpinnedItemMenu(page: Page, name: string) {
  const row = getUnpinnedSection(page)
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) });
  await row.hover();
  await icon(row, "ellipsis").click();
}

/**
 * Cypress intercept `GET /api/(**)/items?pinned_state*` — the collection
 * items request for the pinned (or unpinned) section.
 */
export function waitForPinnedItems(page: Page): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname.endsWith("/items") &&
      url.searchParams.has("pinned_state")
    );
  });
}

/**
 * Cypress intercept `POST /api/card/(**)/query` — a pinned card's query run.
 * `.+` (not a single path segment) because pivot cards query via
 * `/api/card/pivot/:id/query`, which the Cypress glob also matched.
 */
export function waitForCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/.+\/query$/.test(new URL(response.url()).pathname),
  );
}

/**
 * Port of H.dragAndDrop (e2e-dragndrop-helpers.js): fires the HTML5 drag
 * events with a shared DataTransfer, exactly like the Cypress helper — it
 * does not simulate real mouse movement (see the caveat comment in the
 * pin-by-dragging test).
 */
export async function dragAndDrop(page: Page, subject: Locator, target: Locator) {
  void page;
  // Playwright drives real HTML5 drag-and-drop: actual mouse input with CDP
  // drag interception, so the browser itself synthesizes the full
  // dragstart/dragenter/dragover/drop sequence — strictly more realistic
  // than the Cypress helper's three synthetic events (see the caveat comment
  // upstream admitting synthetic dnd "will not guarantee ... the real world").
  await subject.dragTo(target);
}
