/**
 * Playwright port of
 * e2e/test/scenarios/collections/collections-reproductions.cy.spec.ts
 *
 * A grab-bag of collection bug repros; every issue number is preserved as its
 * own describe block.
 *
 * Port notes:
 * - All UI helpers are reused read-only from shared modules: permissions
 *   (assertPermissionTable / getPermissionRowPermissions / modifyPermission),
 *   collection-menu (getCollectionActions / openCollectionMenu /
 *   moveOpenedCollectionTo), entity/mini-picker (startNewQuestion /
 *   miniPickerBrowseAll / miniPicker / entityPickerModal) and ui.ts locators.
 * - createCollectionViaApi (collections-cleanup.ts) is the port of
 *   H.createCollection; cy.request("PUT", "/api/card/:id", …) → mb.api.put.
 * - ADMIN_PERSONAL_COLLECTION_ID / FIRST_COLLECTION_ID / ORDERS_QUESTION_ID
 *   come from shared modules; ORDERS_COUNT_QUESTION_ID is derived in the new
 *   support/collections-reproductions.ts (sample-data.ts doesn't export it).
 * - The three EE describes (30235 / 58231 / 56567) call activateToken and are
 *   gated with resolveToken (PORTING rule 7). The jar activates the token.
 * - cy.realType("{esc}") → page.keyboard.press("Escape"); the modal-close is
 *   confirmed with a toHaveCount(0) before the next interaction.
 * - cy.intercept + cy.wait("@savePermissions") → page.waitForResponse
 *   registered before the Save click (PORTING rule 2).
 */
import { modifyPermission } from "../support/admin-permissions";
import { resolveToken } from "../support/api";
import {
  createCollectionViaApi,
  getCollectionActions,
} from "../support/collections-cleanup";
import {
  moveOpenedCollectionTo,
  openCollectionMenu,
} from "../support/collections-core";
import { ORDERS_COUNT_QUESTION_ID } from "../support/collections-reproductions";
import {
  assertPermissionTable,
  getPermissionRowPermissions,
} from "../support/create-queries";
import { test, expect } from "../support/fixtures";
import { miniPickerBrowseAll } from "../support/joins";
import {
  entityPickerModal,
  miniPicker,
  startNewQuestion,
} from "../support/notebook";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { FIRST_COLLECTION_ID, ORDERS_QUESTION_ID } from "../support/sample-data";
import { icon, main, modal, navigationSidebar, popover } from "../support/ui";

// metabase-types/api is outside the spike tsconfig; collection ids are numeric.
type CollectionId = number;

test.describe("issue 20911", () => {
  const COLLECTION_ACCESS_PERMISSION_INDEX = 0;
  const FIRST_COLLECTION = "First collection";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow to change sub-collections permissions after access change (metabase#20911)", async ({
    page,
    mb,
  }) => {
    const getGraph = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/collection/graph" &&
        r.request().method() === "GET",
    );
    await page.goto("/collection/root/permissions");
    await getGraph;

    await assertPermissionTable(page, [
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);
    await modifyPermission(
      page,
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "No access",
      false,
    );
    await modifyPermission(
      page,
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "No access",
      true,
    );
    await modal(page).getByRole("button", { name: "Save" }).click();

    await navigationSidebar(page)
      .getByText(FIRST_COLLECTION, { exact: true })
      .click();
    await icon(getCollectionActions(page), "ellipsis").click();
    await icon(popover(page), "lock").click();

    await assertPermissionTable(page, [
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "No access"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);

    await mb.signInAsNormalUser();
    await page.goto("/collection/root");
    await expect(
      main(page).getByText("You don't have permissions to do that.", {
        exact: true,
      }),
    ).toBeVisible();

    await page.goto(`/collection/${FIRST_COLLECTION_ID}`);
    await expect(
      main(page).getByText("Sorry, you don’t have permission to see that.", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 24660", () => {
  const collectionName = "Parent";

  const questions: Record<number, string> = {
    [ORDERS_QUESTION_ID]: "Orders",
    [ORDERS_COUNT_QUESTION_ID]: "Orders, Count",
  };

  async function createParentCollectionAndMoveQuestionToIt(
    mb: { api: import("../support/api").MetabaseApi },
    questionId: number,
  ) {
    const { id } = await createCollectionViaApi(mb.api, {
      name: collectionName,
      parent_id: null,
    });
    await mb.api.put(`/api/card/${questionId}`, { collection_id: id });
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await createParentCollectionAndMoveQuestionToIt(mb, ORDERS_QUESTION_ID);
    await createParentCollectionAndMoveQuestionToIt(
      mb,
      ORDERS_COUNT_QUESTION_ID,
    );
  });

  test("should properly show contents of different collections with the same name (metabase#24660)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();

    const modalPicker = entityPickerModal(page);
    await modalPicker.getByText("Our analytics", { exact: true }).click();
    await modalPicker.getByText(collectionName, { exact: true }).first().click();
    await expect(
      modalPicker.getByText(questions[ORDERS_QUESTION_ID], { exact: true }),
    ).toBeVisible();
    await expect(
      modalPicker.getByText(questions[ORDERS_COUNT_QUESTION_ID], {
        exact: true,
      }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(entityPickerModal(page)).toHaveCount(0);

    await page.getByPlaceholder("Search for tables and more...").click();
    const mini = miniPicker(page);
    await mini.getByText("Our analytics", { exact: true }).click();
    await mini.getByText(collectionName, { exact: true }).first().click();
    await expect(
      mini.getByText(questions[ORDERS_QUESTION_ID], { exact: true }),
    ).toBeVisible();
    await expect(
      mini.getByText(questions[ORDERS_COUNT_QUESTION_ID], { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 30235", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow to turn to official collection after moving it from personal to root parent collection (metabase#30235)", async ({
    page,
    mb,
  }) => {
    const COLLECTION_NAME = "C30235";

    const { id } = await createCollectionViaApi(mb.api, {
      name: COLLECTION_NAME,
      parent_id: ADMIN_PERSONAL_COLLECTION_ID,
    });
    await page.goto(`/collection/${id}`);

    await moveOpenedCollectionTo(page, "Our analytics");

    await openCollectionMenu(page);

    await expect(
      popover(page).getByText("Make collection official", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Edit permissions", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 58231", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow to edit permissions for Usage Analytics collection (metabase#58231)", async ({
    page,
  }) => {
    await page.goto("/collection/2-usage-analytics");

    const editPermissions = getCollectionActions(page).getByLabel(
      "Edit permissions",
      { exact: true },
    );
    await expect(editPermissions).toBeVisible();
    await editPermissions.click();

    await expect(
      modal(page).getByText("Permissions for Usage analytics", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 56567", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  const withTestCollections = async (
    mb: { api: import("../support/api").MetabaseApi },
    callback: (
      collectionAId: CollectionId,
      collectionBId: CollectionId,
    ) => Promise<void>,
  ) => {
    const { id: collectionAId } = await createCollectionViaApi(mb.api, {
      name: "A",
    });
    const { id: collectionBId } = await createCollectionViaApi(mb.api, {
      name: "B",
      parent_id: collectionAId,
    });
    await callback(collectionAId, collectionBId);
  };

  const getTestPermissionsTable = (allUsersPermission: string) => [
    ["Administrators", "Curate"],
    ["All Users", allUsersPermission],
    ["collection", "Curate"],
    ["data", "No access"],
    ["Data Analysts", "No access"],
    ["nosql", "No access"],
    ["readonly", "View"],
  ];

  test("should propagate permission to sub-collections when 'Also change sub-collections' is checked (metabase#56567)", async ({
    page,
    mb,
  }) => {
    await withTestCollections(mb, async (collectionAId, collectionBId) => {
      await page.goto(`/admin/permissions/collections/${collectionAId}`);
      await assertPermissionTable(page, getTestPermissionsTable("No access"));

      await page.goto(`/admin/permissions/collections/${collectionBId}`);
      await assertPermissionTable(page, getTestPermissionsTable("No access"));

      await page.goto(`/collection/${collectionAId}-a/permissions`);

      // opens up the permissions select
      await getPermissionRowPermissions(page, "All Users").click();

      // checks the 'Also change sub-collections' toggle
      await popover(page).getByRole("switch").click({ force: true });
      await expect(popover(page).getByRole("switch")).toBeChecked();

      // selected desired permission
      await popover(page).getByText("View", { exact: true }).click();

      // opens up the permissions select again
      await getPermissionRowPermissions(page, "All Users").click();

      // ensures the toggle is still checked
      await expect(popover(page).getByRole("switch")).toBeChecked();

      const savePermissions = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/collection/graph" &&
          r.request().method() === "PUT",
      );
      await page.getByRole("button", { name: "Save" }).click();
      await savePermissions;

      // Checks permissions for collection A is set to "View" as expected
      await page.goto(`/admin/permissions/collections/${collectionBId}`);
      await assertPermissionTable(page, getTestPermissionsTable("View"));

      // Check the permission set to collection A was propagated to collection B
      await page.goto(`/admin/permissions/collections/${collectionBId}`);
      await assertPermissionTable(page, getTestPermissionsTable("View"));
    });
  });

  test("should NOT propagate permission to sub-collections when 'Also change sub-collections' is unchecked", async ({
    page,
    mb,
  }) => {
    await withTestCollections(mb, async (collectionAId, collectionBId) => {
      await page.goto(`/admin/permissions/collections/${collectionBId}`);
      await assertPermissionTable(page, getTestPermissionsTable("No access"));

      await page.goto(`/collection/${collectionAId}-a/permissions`);

      // opens up the permissions select
      await getPermissionRowPermissions(page, "All Users").click();

      // selected desired permission without checking 'Also change sub-collections'
      await popover(page).getByText("View", { exact: true }).click();

      // opens up the permissions select again
      await getPermissionRowPermissions(page, "All Users").click();

      // ensures the toggle is not checked
      await expect(popover(page).getByRole("switch")).not.toBeChecked();

      const savePermissions = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/collection/graph" &&
          r.request().method() === "PUT",
      );
      await page.getByRole("button", { name: "Save" }).click();
      await savePermissions;

      // Checks permissions for collection A is set to "View" as expected
      await page.goto(`/admin/permissions/collections/${collectionAId}`);
      await assertPermissionTable(page, getTestPermissionsTable("View"));

      // Check the permission set to collection A was NOT propagated to collection B
      await page.goto(`/admin/permissions/collections/${collectionBId}`);
      await assertPermissionTable(page, getTestPermissionsTable("No access"));
    });
  });
});
