/**
 * Helpers for the bookmarks-collection spec port: port of
 * H.openCollectionItemMenu (e2e/support/helpers/e2e-collection-helpers.ts).
 */
import type { Page } from "@playwright/test";

import { icon } from "./dashboard-cards";
import { collectionTable } from "./ui";

/**
 * Port of H.openCollectionItemMenu: `.findAllByText(item).eq(index)` — the
 * root collection can hold two items with the same name (the snapshot ships
 * an "Orders Model" and one spec creates another), so index-match like the
 * original. The row ellipsis is hover-gated, so hover the row first.
 */
export async function openCollectionItemMenu(
  page: Page,
  item: string,
  index = 0,
) {
  const row = collectionTable(page)
    .getByRole("row")
    .filter({ has: page.getByText(item, { exact: true }) })
    .nth(index);
  await row.hover();
  await icon(row, "ellipsis").click();
}
