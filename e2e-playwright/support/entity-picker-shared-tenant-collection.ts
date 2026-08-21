/**
 * Spec-local helpers for entity-picker-shared-tenant-collection.spec.ts (port of
 * e2e/test/scenarios/organization/entity-picker-shared-tenant-collection.cy.spec.ts).
 *
 * The Cypress spec keeps two module-local helpers (createTenantCollection /
 * setupTenantCollections); everything else it uses comes from shared H helpers,
 * which are imported directly in the spec from the consolidated support modules.
 */
import { type Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { entityPickerModal } from "./notebook";

/** The virtual root under which shared-tenant-collection namespace collections live. */
export const TENANT_ROOT_NAME = "Shared collections";
export const TENANT_NAMESPACE = "shared-tenant-collection";

/**
 * Navigate the open entity picker into the tenant root, then into
 * "Test Tenant Collection" (leaving that collection selected).
 *
 * The two clicks are the upstream `findByText(root).click()` +
 * `findByText(sub).click()`. Playwright fires them back-to-back, and the tree
 * column re-renders as the tenant root's children load — so the root click can
 * land on a node that's replaced before it navigates, leaving the child column
 * empty and the child click to burn its whole timeout. (The tests that assert a
 * button state between the two clicks never hit this — the assertion paces
 * them, the way Cypress's command queue always did.) Re-click the root inside a
 * toPass loop until the child renders, then click it.
 */
export async function selectTenantSubCollectionInPicker(
  page: Page,
): Promise<void> {
  const modal = entityPickerModal(page);
  const subCollection = modal
    .getByText("Test Tenant Collection", { exact: true })
    .first();
  await expect(async () => {
    await modal.getByText(TENANT_ROOT_NAME, { exact: true }).first().click();
    await expect(subCollection).toBeVisible({ timeout: 5000 });
  }).toPass();
  await subCollection.click();
}

/**
 * Port of the spec-local createTenantCollection: a collection in the
 * shared-tenant-collection namespace. Collections with this namespace and no
 * parent_id are children of the virtual root.
 */
export async function createTenantCollection(
  api: MetabaseApi,
  name: string,
  parentId?: number,
): Promise<{ id: number }> {
  const response = await api.post("/api/collection", {
    name,
    namespace: TENANT_NAMESPACE,
    parent_id: parentId ?? null,
  });
  return (await response.json()) as { id: number };
}

/**
 * Port of the spec-local setupTenantCollections: a tenant collection + sub-collection.
 *
 * `waitForSearchIndex` (opt-in) blocks until "Test Tenant Collection" is
 * searchable. Only the positive search test needs it — a collection created
 * right after restore() can be dropped from the index while restore's own
 * rebuild is still in flight (see fixtures.ts / the "back-to-back restores drop
 * the rebuild trigger" note), so its single debounced picker search finds
 * nothing and never re-fetches. The rest of the suite must NOT enable it: the
 * negative search test relies on the collection being effectively absent from a
 * scoped search, and every non-search test doesn't need the extra reindex cost.
 */
export async function setupTenantCollections(
  api: MetabaseApi,
  { waitForSearchIndex = false }: { waitForSearchIndex?: boolean } = {},
): Promise<{
  tenantCollectionId: number;
  subCollectionId: number;
}> {
  const { id: tenantCollectionId } = await createTenantCollection(
    api,
    "Test Tenant Collection",
  );
  const { id: subCollectionId } = await createTenantCollection(
    api,
    "Tenant Sub-Collection",
    tenantCollectionId,
  );
  if (waitForSearchIndex) {
    await waitForCollectionSearchable(api, "Test Tenant Collection");
  }
  return { tenantCollectionId, subCollectionId };
}

/**
 * Force a reindex and poll (as the current admin) until `name` is searchable —
 * the same readiness pattern restore() uses for tables (fixtures.ts), scoped to
 * a just-created collection.
 *
 * Poll the EXACT endpoint the entity picker uses (`context=entity-picker`), not
 * the bare `models=collection` variant: the two indexes can become ready a beat
 * apart, and the picker fires ONE debounced RTK-Query search whose empty result
 * is then cached under the query string — a re-type with the same string hits
 * the cache and never refetches. Confirming the picker's own query is ready
 * before the test types guarantees that single fire returns the collection.
 */
async function waitForCollectionSearchable(
  api: MetabaseApi,
  name: string,
): Promise<void> {
  const query = `/api/search?q=${encodeURIComponent(name)}&models=collection&context=entity-picker&limit=50&calculate_available_models=true`;
  const deadline = Date.now() + 20_000;
  let forcedReindex = false;
  while (Date.now() < deadline) {
    const response = await api.get(query, { failOnStatusCode: false });
    if (response.ok()) {
      const body = await response.json().catch(() => ({ data: [] }));
      if ((body.data ?? []).length > 0) {
        return;
      }
    }
    if (!forcedReindex) {
      forcedReindex = true;
      await api.post("/api/search/force-reindex", undefined, {
        failOnStatusCode: false,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
