/**
 * Port of
 * e2e/test/scenarios/collections/collection-picker-tenants.cy.spec.ts
 *
 * The collection picker showing tenant (shared-tenant-collection namespace)
 * collections: shared collections and their sub-collections cannot be marked
 * "Official", and the new-collection modal hides the "Collection type"
 * (Regular / Official) picker whenever its target is a shared collection —
 * toggling as the target switches between normal and shared collections.
 *
 * EE token gate — use-tenants + the shared-tenant-collection namespace are EE.
 * The jar activates the token via cypress.env.json (pro-self-hosted).
 *
 * Notes on the port:
 * - `H.activateToken` / `H.updateSetting` → `mb.api.*`.
 * - The module-local `createSharedCollection` is identical to
 *   `createTenantCollection`; imported (re-exported) from
 *   support/collection-picker-tenants.ts, which pulls it from the shared
 *   entity-picker-shared-tenant-collection module.
 * - `cy.button(name)` / `findByText(str)` string args → exact matches.
 *   `cy.findByText(/Collection type/i)` is a case-insensitive regex → kept as one.
 * - Negative "Collection type" checks are guarded on the modal having rendered
 *   (the picker button is visible / shows the expected target) so they can't
 *   pass on an unmounted modal.
 */
import { expect, test } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { entityPickerModal } from "../support/notebook";
import { popover } from "../support/ui";
import { visitCollection } from "../support/question-new";
import { openCollectionMenu } from "../support/collections-core";
import { startNewCollectionFromSidebar } from "../support/command-palette";
import {
  createNewCollectionFromHeader,
  createSharedCollection,
  selectSharedCollectionInPicker,
} from "../support/collection-picker-tenants";

// EE token gate — the shared-tenant-collection namespace is an EE feature.
test.skip(
  !resolveToken("pro-self-hosted"),
  "requires the pro-self-hosted token",
);

test.describe("scenarios > collections > collection picker with tenants", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("use-tenants", true);
  });

  test("should not allow marking collections as official in shared collections and its sub-collections", async ({
    page,
    mb,
  }) => {
    const { id: sharedCollectionId } = await createSharedCollection(
      mb.api,
      "Test Shared Collection",
    );

    // Navigate to the shared collection
    await visitCollection(page, sharedCollectionId);

    // Verify collection loaded
    await expect(page.getByTestId("collection-name-heading")).toHaveText(
      "Test Shared Collection",
    );

    // Open the three-dots menu and verify cannot mark as official
    await openCollectionMenu(page);
    await expect(
      popover(page).getByText("Make collection official", { exact: true }),
    ).toHaveCount(0);
    await expect(
      popover(page).getByText("Remove Official badge", { exact: true }),
    ).toHaveCount(0);

    // Close the popover
    await page.getByTestId("app-bar").click();

    // Create a new collection
    await createNewCollectionFromHeader(page);

    const newCollectionModal = page.getByTestId("new-collection-modal");

    // Verify we're creating inside the shared collection (also guards that the
    // modal has rendered before the negative Collection-type assertions).
    await expect(
      newCollectionModal.getByTestId("collection-picker-button"),
    ).toContainText("Test Shared Collection");

    // Should not see the "Collection type" picker
    await expect(
      newCollectionModal.getByText(/Collection type/i),
    ).toHaveCount(0);
    await expect(
      newCollectionModal.getByText("Regular", { exact: true }),
    ).toHaveCount(0);
    await expect(
      newCollectionModal.getByText("Official", { exact: true }),
    ).toHaveCount(0);

    // Edge case: change the target collection to a normal collection
    await newCollectionModal.getByTestId("collection-picker-button").click();

    // Select "Our analytics" (a normal collection)
    await entityPickerModal(page)
      .getByText("Our analytics", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select", exact: true })
      .click();

    // Wait for the collection picker to update to "Our analytics"
    await expect(
      newCollectionModal.getByTestId("collection-picker-button"),
    ).toContainText("Our analytics");

    // Should now see the "Collection type" picker
    await expect(newCollectionModal.getByText(/Collection type/i)).toBeVisible();
    await expect(
      newCollectionModal.getByText("Regular", { exact: true }),
    ).toBeVisible();
    await expect(
      newCollectionModal.getByText("Official", { exact: true }),
    ).toBeVisible();

    // Close modal without creating
    await newCollectionModal.getByLabel("Close").click();
  });

  test("should block official collections in sub-collections of shared collections", async ({
    page,
    mb,
  }) => {
    const { id: sharedParentId } = await createSharedCollection(
      mb.api,
      "Shared Parent Collection",
    );
    const { id: sharedSubCollectionId } = await createSharedCollection(
      mb.api,
      "Shared Sub Collection",
      sharedParentId,
    );

    // Navigate to the sub-collection
    await visitCollection(page, sharedSubCollectionId);

    // Verify sub-collection loaded
    await expect(page.getByTestId("collection-name-heading")).toHaveText(
      "Shared Sub Collection",
    );

    // Open collection menu
    await openCollectionMenu(page);
    await expect(
      popover(page).getByText("Make collection official", { exact: true }),
    ).toHaveCount(0);
    await expect(
      popover(page).getByText("Remove Official badge", { exact: true }),
    ).toHaveCount(0);

    // Close the popover
    await page.getByTestId("app-bar").click();

    // Create a new sub-sub-collection
    await createNewCollectionFromHeader(page);

    const newCollectionModal = page.getByTestId("new-collection-modal");
    // Guard: the modal has rendered before the negative assertions.
    await expect(
      newCollectionModal.getByTestId("collection-picker-button"),
    ).toBeVisible();

    // Should not see the "Collection type" picker
    await expect(
      newCollectionModal.getByText(/Collection type/i),
    ).toHaveCount(0);
    await expect(
      newCollectionModal.getByText("Regular", { exact: true }),
    ).toHaveCount(0);
    await expect(
      newCollectionModal.getByText("Official", { exact: true }),
    ).toHaveCount(0);
  });

  test("should hide collection type picker when switching from normal to shared collection in create modal", async ({
    page,
    mb,
  }) => {
    await createSharedCollection(mb.api, "Target Shared Collection");

    // Start creating a new collection from root
    await page.goto("/collection/root");
    await startNewCollectionFromSidebar(page);

    const newCollectionModal = page.getByTestId("new-collection-modal");

    // Initially should see the collection type picker
    await expect(newCollectionModal.getByText(/Collection type/i)).toBeVisible();

    // Click collection picker to change target
    await newCollectionModal.getByTestId("collection-picker-button").click();

    // Navigate to Shared collections → Target Shared Collection
    await selectSharedCollectionInPicker(page, "Target Shared Collection");
    await entityPickerModal(page)
      .getByRole("button", { name: "Select", exact: true })
      .click();

    // Should no longer see the collection type picker
    await expect(
      newCollectionModal.getByText(/Collection type/i),
    ).toHaveCount(0);
    await expect(
      newCollectionModal.getByText("Regular", { exact: true }),
    ).toHaveCount(0);
    await expect(
      newCollectionModal.getByText("Official", { exact: true }),
    ).toHaveCount(0);
  });

  test("should show collection type picker when switching from shared to normal collection in create modal", async ({
    page,
    mb,
  }) => {
    const { id: sharedCollectionId } = await createSharedCollection(
      mb.api,
      "Shared Collection for Switching",
    );

    // Navigate inside the shared collection
    await visitCollection(page, sharedCollectionId);

    // Start creating a sub-collection
    await createNewCollectionFromHeader(page);

    const newCollectionModal = page.getByTestId("new-collection-modal");
    // Guard: the modal has rendered before the negative assertion.
    await expect(
      newCollectionModal.getByTestId("collection-picker-button"),
    ).toBeVisible();

    // Should not see the collection type picker initially
    await expect(
      newCollectionModal.getByText(/Collection type/i),
    ).toHaveCount(0);

    // Click collection picker to change target
    await newCollectionModal.getByTestId("collection-picker-button").click();

    // Select "Our analytics" (normal collection)
    await entityPickerModal(page)
      .getByText("Our analytics", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select", exact: true })
      .click();

    // Wait for the collection picker to update to "Our analytics"
    await expect(
      newCollectionModal.getByTestId("collection-picker-button"),
    ).toContainText("Our analytics");

    // Should now see the collection type picker
    await expect(newCollectionModal.getByText(/Collection type/i)).toBeVisible();
    await expect(
      newCollectionModal.getByText("Regular", { exact: true }),
    ).toBeVisible();
    await expect(
      newCollectionModal.getByText("Official", { exact: true }),
    ).toBeVisible();
  });
});
