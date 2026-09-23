/**
 * Spec-local helpers for collection-picker-tenants.spec.ts (port of
 * e2e/test/scenarios/collections/collection-picker-tenants.cy.spec.ts).
 *
 * The Cypress spec keeps one module-local helper (createSharedCollection); it is
 * identical to createTenantCollection from
 * entity-picker-shared-tenant-collection.ts, so we import that read-only rather
 * than re-implement it. Everything else here is genuinely new to this spec: the
 * collection-header "Create a new collection" entry point and the tenant-root →
 * sub-collection picker navigation for an arbitrary collection name.
 */
import { type Page, expect } from "@playwright/test";

import { entityPickerModal } from "./notebook";
import { TENANT_ROOT_NAME } from "./entity-picker-shared-tenant-collection";

// Re-export so the spec imports its "createSharedCollection" from one place.
export {
  TENANT_ROOT_NAME,
  createTenantCollection as createSharedCollection,
} from "./entity-picker-shared-tenant-collection";

/**
 * Port of the repeated
 * `cy.findByTestId("collection-menu").findByLabelText("Create a new collection").click()`.
 *
 * This is the in-page collection *header* menu (testid `collection-menu`), NOT
 * the navigation-sidebar "Create a new collection" that
 * `startNewCollectionFromSidebar` clicks.
 */
export async function createNewCollectionFromHeader(page: Page): Promise<void> {
  await page
    .getByTestId("collection-menu")
    .getByLabel("Create a new collection")
    .click();
}

/**
 * Navigate the open entity picker into the tenant root ("Shared collections"),
 * then into `name`, leaving that collection selected.
 *
 * Generalises selectTenantSubCollectionInPicker: the tree column re-renders as
 * the tenant root's children load, so a back-to-back root-then-child click can
 * land the root click on a node that is replaced before it navigates, leaving
 * the child column empty and the child click to burn its whole timeout. Re-click
 * the root inside a toPass loop until the target renders, then click it.
 */
export async function selectSharedCollectionInPicker(
  page: Page,
  name: string,
): Promise<void> {
  const modal = entityPickerModal(page);
  const target = modal.getByText(name, { exact: true }).first();
  await expect(async () => {
    await modal.getByText(TENANT_ROOT_NAME, { exact: true }).first().click();
    await expect(target).toBeVisible({ timeout: 5000 });
  }).toPass();
  await target.click();
}
