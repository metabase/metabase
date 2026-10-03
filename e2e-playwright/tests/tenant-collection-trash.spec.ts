/**
 * Playwright port of
 * e2e/test/scenarios/collections/tenant-collection-trash.cy.spec.ts
 *
 * metabase#74461: permanently deleting a trashed shared-tenant-collection used
 * to fail with a 400.
 *
 * Port notes:
 * - EE: upstream activates the `bleeding-edge` token (not pro-self-hosted) —
 *   kept, with a `test.skip(!resolveToken("bleeding-edge"))` gate.
 * - The spec-local `createTenantCollection` is already ported (identical body)
 *   in support/entity-picker-shared-tenant-collection.ts — reused.
 * - `cy.intercept("DELETE","/api/collection/*").as(...)` + `cy.wait(...).its(
 *   "response.statusCode")` → a `waitForResponse` registered BEFORE the
 *   click that triggers it (rule 2), status asserted after.
 * - `H.modal().findByText(...)` string args are exact matches (rule 1). The
 *   modal's confirm button is `findByText("Delete permanently")`, which is also
 *   the banner's link text — scoping to the modal keeps them apart, exactly as
 *   upstream's `H.modal()` scope does.
 */
import { resolveToken } from "../support/api";
import { archiveCollection } from "../support/collections-trash";
import { createTenantCollection } from "../support/entity-picker-shared-tenant-collection";
import { test, expect } from "../support/fixtures";
import { modal } from "../support/ui";

const TENANT_COLLECTION_NAME = "Acme Tenant Collection";

test.describe("scenarios > collections > tenant collection trash", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "tenants are an EE feature — requires the bleeding-edge token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
    await mb.api.updateSetting("use-tenants", true);
  });

  test("can permanently delete a trashed shared tenant collection (metabase#74461)", async ({
    page,
    mb,
  }) => {
    const collection = await createTenantCollection(
      mb.api,
      TENANT_COLLECTION_NAME,
    );

    await archiveCollection(mb.api, collection.id);

    await page.goto(`/collection/${collection.id}`);

    // the trashed collection page shows the archived banner
    const archiveBanner = page.getByTestId("archive-banner");
    await expect(archiveBanner).toBeVisible();

    // permanently delete it from the banner
    await archiveBanner
      .getByText("Delete permanently", { exact: true })
      .click();
    await expect(
      modal(page).getByText(`Delete ${TENANT_COLLECTION_NAME} permanently?`, {
        exact: true,
      }),
    ).toBeVisible();

    const deleteCollection = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        /^\/api\/collection\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await modal(page).getByText("Delete permanently", { exact: true }).click();

    // the delete request succeeds rather than failing with a 400
    expect((await deleteCollection).status()).toBe(200);

    // the collection is gone from the database
    const getCollection = await mb.api.fetch(
      "GET",
      `/api/collection/${collection.id}`,
      { failOnStatusCode: false },
    );
    expect(getCollection.status()).toBe(404);
  });
});
