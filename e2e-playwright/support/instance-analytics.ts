/**
 * Helpers for the instance-analytics port
 * (e2e/test/scenarios/collections/instance-analytics.cy.spec.js).
 *
 * The spec exercises the "Metabase analytics" content — the read-only audit
 * collections that ship on the EE jar (Usage analytics / Custom reports),
 * their pinned audit model + dashboards, and the per-entity "Insights" links.
 * Only the spec-local helpers live here; everything else (popover/modal/main,
 * visit*, tableInteractive, sidesheet, …) is imported from the shared modules.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { questionInfoButton, sidesheet } from "./revisions";
import { icon } from "./ui";

export const ANALYTICS_COLLECTION_NAME = "Usage analytics";
export const CUSTOM_REPORTS_COLLECTION_NAME = "Custom reports";
export const PEOPLE_MODEL_NAME = "People";
export const METRICS_DASHBOARD_NAME = "Metabase metrics";

/** Port of the spec-local getCollectionId: GET /api/collection, match by name. */
export async function getCollectionId(
  api: MetabaseApi,
  collectionName: string,
): Promise<number> {
  const body = (await (await api.get("/api/collection")).json()) as {
    id: number;
    name: string;
  }[];
  const collection = body.find(({ name }) => name === collectionName);
  if (!collection) {
    throw new Error(`No collection named "${collectionName}"`);
  }
  return collection.id;
}

/** Port of the spec-local visitCollection: look the collection up by name,
 * then navigate to it. */
export async function visitCollection(
  page: Page,
  api: MetabaseApi,
  collectionName: string,
) {
  const id = await getCollectionId(api, collectionName);
  await page.goto(`/collection/${id}`);
}

/** Port of the spec-local getItemId: the id of the named item inside the named
 * collection. */
export async function getItemId(
  api: MetabaseApi,
  collectionName: string,
  itemName: string,
): Promise<number> {
  const id = await getCollectionId(api, collectionName);
  const body = (await (await api.get(`/api/collection/${id}/items`)).json()) as {
    data: { id: number; name: string }[];
  };
  const item = body.data.find(({ name }) => name === itemName);
  if (!item) {
    throw new Error(`No item named "${itemName}" in "${collectionName}"`);
  }
  return item.id;
}

/** Port of H.openQuestionInfoSidesheet (e2e-ui-elements-helpers.js): click the
 * QB header info button, return the opened sidesheet. */
export async function openQuestionInfoSidesheet(page: Page): Promise<Locator> {
  await questionInfoButton(page).click();
  return sidesheet(page);
}

/**
 * Port of the spec-local `cy.findAllByTestId("collection-entry").each(...)`
 * loop: hover the collection-listing row whose name is exactly `name` and open
 * its (hover-gated) ellipsis menu. The `<tr>` carries the `collection-entry`
 * testid; filtering on the exact name (auto-waiting, so it survives the listing
 * rendering a beat after navigation) mirrors the Cypress `el.text() === name`
 * check. The menu renders in a portal, so callers scope subsequent assertions
 * to a shared `popover()`, not the row.
 */
export async function openCollectionEntryMenu(page: Page, name: string) {
  const row = page
    .getByTestId("collection-entry")
    .filter({ has: page.getByText(name, { exact: true }) });
  // Row ellipsis is revealed on hover (opacity) — Playwright needs the real
  // hover before the icon is actionable; Cypress clicked through it.
  await row.hover();
  await icon(row, "ellipsis").click({ force: true });
}
