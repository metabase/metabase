/**
 * Playwright port of e2e/test/scenarios/collections/trash.cy.spec.js
 *
 * Port notes:
 * - The "Snowplow analytics" describe is gated on snowplow in Cypress
 *   (resetSnowplow / expectNoBadSnowplowEvents / expectUnstructuredSnowplowEvent).
 *   Those run real assertions here, backed by the per-slot collector via
 *   ../support/snowplow; the trash/restore UI flow inside is ported for real too.
 * - Cypress intercept aliases (cy.intercept + cy.wait) for the highlight-trash
 *   test are dropped: the visit* helpers already await the responses they need.
 * - The sidebar-drag "@updateDashboard.all" counters become countRequests()
 *   (dashboard-parameters.ts) registered before the drag.
 * - HTML5 drag/drop reuses support/collections.ts dragAndDrop (real CDP dnd),
 *   never the bare Cypress 3-event sequence (PORTING.md rule).
 * - New spec-local helpers live in support/collections-trash.ts.
 */
import type { Page } from "@playwright/test";

import { dragAndDrop } from "../support/collections";
import {
  archiveBanner,
  archiveCollection,
  assertChecked,
  assertTrashSelectedInNavigationSidebar,
  createCollection,
  createDashboard,
  createNativeQuestion,
  createQuestion,
  ensureBookmarkVisible,
  ensureCanRestoreFromPage,
  selectItem,
  selectSidebarItem,
  toggleEllipsisMenuFor,
  visitRootCollection,
} from "../support/collections-trash";
import { modifyPermission } from "../support/command-palette";
import { undo } from "../support/dashboard-parameters";
import { sidebar } from "../support/dashboard";
import { countRequests } from "../support/dashboard-parameters";
import { READ_ONLY_PERSONAL_COLLECTION_ID } from "../support/documents-core";
import { test, expect } from "../support/fixtures";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { miniPickerBrowseAll } from "../support/joins";
import { entityPickerModal, miniPicker } from "../support/notebook";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
} from "../support/organization";
import { visitCollection } from "../support/question-new";
import { FIRST_COLLECTION_ID, ORDERS_QUESTION_ID } from "../support/sample-data";
import { main } from "../support/sharing";
import {
  appBar,
  collectionTable,
  icon,
  modal,
  navigationSidebar,
  popover,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const movedToTrashEvent =
  (eventDetail: string, triggeredFrom: string) =>
  (event: Record<string, unknown>) =>
    event.event === "moved-to-trash" &&
    event.event_detail === eventDetail &&
    typeof event.target_id === "number" &&
    event.triggered_from === triggeredFrom &&
    typeof event.duration_ms === "number" &&
    event.result === "success";

const isDashboardPut = (method: string, pathname: string) =>
  method === "PUT" && pathname.startsWith("/api/dashboard/");

test.describe("scenarios > collections > trash", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("trash collection should be treated different in ui", async ({
    page,
    mb,
  }) => {
    await createCollection(mb.api, { name: "Collection A" }, true);
    await createNativeQuestion(
      mb.api,
      {
        type: "model",
        name: "Model A",
        native: { query: "select * from products limit 5" },
      },
      true,
    );
    await page.goto("/");

    // should show trash at bottom of the side navbar
    const trashLink = navigationSidebar(page)
      .getByTestId("sidebar-collection-link-root")
      .last();
    await expect(trashLink).toContainText("Trash");

    // should not be expandable in sidebar with items in it
    await expect(icon(trashLink, "chevronright")).toBeHidden();

    // table headers should say deleted by / deleted at
    await trashLink.click();
    const tableHead = page.getByTestId("items-table-head");
    await expect(tableHead.getByText("Deleted by", { exact: true })).toBeVisible();
    await expect(tableHead.getByText("Deleted at", { exact: true })).toBeVisible();

    // trashed items in collection should have restore/delete, not move-to-trash
    await toggleEllipsisMenuFor(page, "Collection A");
    await expect(
      popover(page).getByText("Move to trash", { exact: true }),
    ).toHaveCount(0);
    await expect(
      popover(page).getByText("Restore", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Delete permanently", { exact: true }),
    ).toBeVisible();
    await toggleEllipsisMenuFor(page, "Collection A");

    // items in trash should have greyed out icons
    await expect(icon(collectionTable(page), "model").first()).toHaveCSS(
      "color",
      "rgba(7, 23, 34, 0.44)",
    );

    // there should not be pins in the trash
    await expect(page.getByTestId("pinned-items")).toHaveCount(0);

    // trash should not appear in 'our analytics'
    await visitRootCollection(page);
    await expect(
      collectionTable(page).getByText("Trash", { exact: true }),
    ).toHaveCount(0);

    // trash should not appear in query builder source picker
    await appBar(page).getByText("New", { exact: true }).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await expect(
      miniPicker(page).getByText("Our analytics", { exact: true }),
    ).toBeVisible();
    await expect(
      miniPicker(page).getByText("Trash", { exact: true }),
    ).toHaveCount(0);
    await miniPickerBrowseAll(page).click();
    await expect(
      entityPickerModal(page).getByText("Our analytics", { exact: true }),
    ).toBeVisible();
    await expect(
      entityPickerModal(page).getByText("Trash", { exact: true }),
    ).toHaveCount(0);
    await entityPickerModal(page)
      .getByRole("button", { name: "Close", exact: true })
      .click();

    // trash should not appear in collection picker
    await appBar(page).getByText("New", { exact: true }).click();
    await popover(page).getByText("Dashboard", { exact: true }).click();
    await modal(page).getByText("Our analytics", { exact: true }).click();
    await expect(
      entityPickerModal(page).getByText("First collection", { exact: true }),
    ).toBeVisible();
    await expect(
      entityPickerModal(page).getByText("Trash", { exact: true }),
    ).toHaveCount(0);

    // trash should not appear in collection permissions sidebar
    await page.goto("/admin/permissions/collections");
    await expect(sidebar(page).getByText("Trash", { exact: true })).toHaveCount(
      0,
    );
  });

  test.describe("Snowplow analytics", () => {
    test.beforeEach(async ({ mb }) => {
      await resetSnowplow(mb);
    });

    test.afterEach(async ({ mb }) => {
      await expectNoBadSnowplowEvents(mb);
    });

    test("should be able to trash & restore dashboards/collections/questions on entity page and from parent collection", async ({
      page,
      mb,
    }) => {
      // create + bookmark test resources (bookmarks test metabase#44224)
      const collection = await createCollection(mb.api, { name: "Collection A" });
      await mb.api.post(`/api/bookmark/collection/${collection.id}`);
      const dashboard = await createDashboard(mb.api, { name: "Dashboard A" });
      await mb.api.post(`/api/bookmark/dashboard/${dashboard.id}`);
      const question = await createNativeQuestion(mb.api, {
        name: "Question A",
        native: { query: "select 1;" },
      });
      await mb.api.post(`/api/bookmark/card/${question.id}`);

      await visitRootCollection(page);

      // move to trash from collection view
      await toggleEllipsisMenuFor(page, /Collection A/);
      await popover(page).getByText("Move to trash", { exact: true }).click();
      await expectUnstructuredSnowplowEvent(
        mb,
        movedToTrashEvent("collection", "collection"),
      );

      await toggleEllipsisMenuFor(page, "Dashboard A");
      await popover(page).getByText("Move to trash", { exact: true }).click();
      await expectUnstructuredSnowplowEvent(
        mb,
        movedToTrashEvent("dashboard", "collection"),
      );

      await toggleEllipsisMenuFor(page, "Question A");
      await popover(page).getByText("Move to trash", { exact: true }).click();
      await expectUnstructuredSnowplowEvent(
        mb,
        movedToTrashEvent("question", "collection"),
      );

      // restore items from trash collection view
      await navigationSidebar(page).getByText("Trash", { exact: true }).click();

      await toggleEllipsisMenuFor(page, /Collection A/);
      await popover(page).getByText("Restore", { exact: true }).click();
      await ensureBookmarkVisible(page, /Collection A/);

      await toggleEllipsisMenuFor(page, "Dashboard A");
      await popover(page).getByText("Restore", { exact: true }).click();
      await ensureBookmarkVisible(page, "Dashboard A");

      await toggleEllipsisMenuFor(page, "Question A");
      await popover(page).getByText("Restore", { exact: true }).click();
      await ensureBookmarkVisible(page, "Question A");

      // archive entities from their own views
      await visitRootCollection(page);

      // collection
      await collectionTable(page)
        .getByText("Collection A", { exact: true })
        .click();
      await icon(page.getByTestId("collection-menu"), "ellipsis").click();
      await popover(page).getByText("Move to trash", { exact: true }).click();
      await expect(
        modal(page).getByText("Move this collection to trash?", {
          exact: true,
        }),
      ).toBeVisible();
      await modal(page).getByText("Move to trash", { exact: true }).click();
      // Wait for the confirm modal to unmount before any navigation: a later
      // page.goBack() restores that page from bfcache, and a still-open modal
      // overlay would be frozen into the snapshot and block the banner click.
      await expect(modal(page)).toHaveCount(0);
      await expectUnstructuredSnowplowEvent(
        mb,
        movedToTrashEvent("collection", "detail_page"),
      );
      await ensureCanRestoreFromPage(page, "Collection A");
      await ensureBookmarkVisible(page, "Collection A");

      // dashboard
      await collectionTable(page)
        .getByText("Dashboard A", { exact: true })
        .click();
      await icon(page.getByTestId("dashboard-header"), "ellipsis").click();
      await popover(page).getByText("Move to trash", { exact: true }).click();
      await expect(
        modal(page).getByText("Move this dashboard to trash?", { exact: true }),
      ).toBeVisible();
      await modal(page).getByText("Move to trash", { exact: true }).click();
      // Wait for the confirm modal to unmount before any navigation: a later
      // page.goBack() restores that page from bfcache, and a still-open modal
      // overlay would be frozen into the snapshot and block the banner click.
      await expect(modal(page)).toHaveCount(0);
      await expectUnstructuredSnowplowEvent(
        mb,
        movedToTrashEvent("dashboard", "detail_page"),
      );
      await visitRootCollection(page);
      await expect(
        collectionTable(page).getByText("Dashboard A", { exact: true }),
      ).toHaveCount(0);
      await ensureCanRestoreFromPage(page, "Dashboard A");
      await ensureBookmarkVisible(page, "Dashboard A");

      // question
      await collectionTable(page)
        .getByText("Question A", { exact: true })
        .click();
      await icon(
        page.getByTestId("qb-header-action-panel"),
        "ellipsis",
      ).click();
      await popover(page).getByText("Move to trash", { exact: true }).click();
      await expect(
        modal(page).getByText("Move this question to trash?", { exact: true }),
      ).toBeVisible();
      await modal(page).getByText("Move to trash", { exact: true }).click();
      // Wait for the confirm modal to unmount before any navigation: a later
      // page.goBack() restores that page from bfcache, and a still-open modal
      // overlay would be frozen into the snapshot and block the banner click.
      await expect(modal(page)).toHaveCount(0);
      await expectUnstructuredSnowplowEvent(
        mb,
        movedToTrashEvent("question", "detail_page"),
      );
      await visitRootCollection(page);
      await expect(
        collectionTable(page).getByText("Question A", { exact: true }),
      ).toHaveCount(0);
      await ensureCanRestoreFromPage(page, "Question A");
      await ensureBookmarkVisible(page, "Question A");
    });
  });

  test("should not show restore option if entity is within nested in an archived collection list", async ({
    page,
    mb,
  }) => {
    const collectionA = await createCollection(mb.api, { name: "Collection A" });
    await createCollection(mb.api, {
      name: "Collection B",
      parent_id: collectionA.id,
    });
    await archiveCollection(mb.api, collectionA.id);

    // only shows restore in root trash collection
    await page.goto("/trash");

    await toggleEllipsisMenuFor(page, "Collection A");
    await expect(
      popover(page).getByText("Restore", { exact: true }),
    ).toBeVisible();
    await collectionTable(page).getByText("Collection A", { exact: true }).click();

    await toggleEllipsisMenuFor(page, "Collection B");
    await expect(
      popover(page).getByText("Restore", { exact: true }),
    ).toHaveCount(0);

    // only shows restore on entity page if in root trash collection
    await page.goto("/trash");
    await collectionTable(page).getByText("Collection A", { exact: true }).click();
    await expect(
      archiveBanner(page).getByText("Restore", { exact: true }),
    ).toBeVisible();
    await collectionTable(page).getByText("Collection B", { exact: true }).click();
    await expect(
      archiveBanner(page).getByText("Restore", { exact: true }),
    ).toHaveCount(0);
  });

  test("should be able to move <entity> out of trash collection", async ({
    page,
    mb,
  }) => {
    await createCollection(mb.api, { name: "Collection A" }, true);
    await createCollection(mb.api, { name: "Collection B" }, true);
    await createDashboard(mb.api, { name: "Dashboard A" }, true);
    await createDashboard(mb.api, { name: "Dashboard B" }, true);
    const query = { native: { query: "select 1;" } };
    await createNativeQuestion(mb.api, { name: "Question A", ...query }, true);
    await createNativeQuestion(mb.api, { name: "Question B", ...query }, true);

    // can move from trash list
    await page.goto("/trash");
    for (const name of ["Collection A", "Dashboard A", "Question A"]) {
      await toggleEllipsisMenuFor(page, name);
      await popover(page).getByText("Move", { exact: true }).click();
      await modal(page).getByText("First collection", { exact: true }).click();
      await modal(page).getByRole("button", { name: "Move", exact: true }).click();
    }

    await expect(
      collectionTable(page).getByText("Collection A", { exact: true }),
    ).toHaveCount(0);
    await expect(
      collectionTable(page).getByText("Dashboard A", { exact: true }),
    ).toHaveCount(0);
    await expect(
      collectionTable(page).getByText("Question A", { exact: true }),
    ).toHaveCount(0);

    await visitCollection(page, FIRST_COLLECTION_ID);
    await expect(
      collectionTable(page).getByText("Collection A", { exact: true }),
    ).toBeVisible();
    await expect(
      collectionTable(page).getByText("Dashboard A", { exact: true }),
    ).toBeVisible();
    await expect(
      collectionTable(page).getByText("Question A", { exact: true }),
    ).toBeVisible();

    // can move from entity page
    for (const name of ["Collection B", "Dashboard B", "Question B"]) {
      await page.goto("/trash");
      await collectionTable(page).getByText(name, { exact: true }).click();
      await archiveBanner(page).getByText("Move", { exact: true }).click();
      await modal(page).getByText("First collection", { exact: true }).click();
      await modal(page).getByRole("button", { name: "Move", exact: true }).click();
      await expect(archiveBanner(page)).toHaveCount(0);
    }

    await page.goto("/trash");
    await expect(
      collectionTable(page).getByText("Collection A", { exact: true }),
    ).toHaveCount(0);
    await expect(
      collectionTable(page).getByText("Dashboard A", { exact: true }),
    ).toHaveCount(0);
    await expect(
      collectionTable(page).getByText("Question A", { exact: true }),
    ).toHaveCount(0);

    await visitCollection(page, FIRST_COLLECTION_ID);
    await expect(
      collectionTable(page).getByText("Collection A", { exact: true }),
    ).toBeVisible();
    await expect(
      collectionTable(page).getByText("Dashboard A", { exact: true }),
    ).toBeVisible();
    await expect(
      collectionTable(page).getByText("Question A", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to permanently delete <entity> on archived entity page or from trash & trashed collections", async ({
    page,
    mb,
  }) => {
    await createCollection(mb.api, { name: "Collection A" }, true);
    await createCollection(mb.api, { name: "Collection B" }, true);
    await createDashboard(mb.api, { name: "Dashboard A" }, true);
    await createDashboard(mb.api, { name: "Dashboard B" }, true);
    const query = { native: { query: "select 1;" } };
    await createNativeQuestion(mb.api, { name: "Question A", ...query }, true);
    await createNativeQuestion(mb.api, { name: "Question B", ...query }, true);

    await page.goto("/trash");

    // can delete from trash list
    for (const name of ["Collection A", "Dashboard A", "Question A"]) {
      await toggleEllipsisMenuFor(page, name);
      await expect(popover(page)).toContainText("Delete permanently");
      await popover(page)
        .getByText("Delete permanently", { exact: true })
        .click();
      await expect(
        modal(page).getByText(`Delete ${name} permanently?`, { exact: true }),
      ).toBeVisible();
      await modal(page)
        .getByText("Delete permanently", { exact: true })
        .click();
      await expect(
        collectionTable(page).getByText(name, { exact: true }),
      ).toHaveCount(0);
    }

    // can delete from entity page
    for (const name of ["Collection B", "Dashboard B", "Question B"]) {
      await collectionTable(page).getByText(name, { exact: true }).click();
      await archiveBanner(page)
        .getByText("Delete permanently", { exact: true })
        .click();
      await expect(
        modal(page).getByText(`Delete ${name} permanently?`, { exact: true }),
      ).toBeVisible();
      await modal(page)
        .getByText("Delete permanently", { exact: true })
        .click();
      await expect(
        collectionTable(page).getByText(name, { exact: true }),
      ).toHaveCount(0);
    }
  });

  test.describe("bulk actions", () => {
    test.beforeEach(async ({ page, mb }) => {
      await createCollection(mb.api, { name: "Collection A" }, true);
      await createDashboard(mb.api, { name: "Dashboard A" }, true);
      await createNativeQuestion(
        mb.api,
        { name: "Question A", native: { query: "select 1;" } },
        true,
      );
      await page.goto("/trash");
    });

    test("user should be able to bulk restore", async ({ page }) => {
      await selectItem(page, "Collection A");
      await selectItem(page, "Dashboard A");
      await selectItem(page, "Question A");

      const toastCard = page.getByTestId("toast-card");
      await expect(toastCard).toBeVisible();
      await expect(
        toastCard.getByRole("button", { name: "Delete permanently", exact: true }),
      ).toBeEnabled();
      await expect(
        toastCard.getByRole("button", { name: "Move", exact: true }),
      ).toBeEnabled();
      await toastCard
        .getByRole("button", { name: "Restore", exact: true })
        .click();

      await expect(
        collectionTable(page).getByText("Collection A", { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText("Dashboard A", { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText("Question A", { exact: true }),
      ).toHaveCount(0);
    });

    test("user should be able to bulk move out of trash", async ({ page }) => {
      await selectItem(page, "Collection A");
      await selectItem(page, "Dashboard A");
      await selectItem(page, "Question A");

      const toastCard = page.getByTestId("toast-card");
      await expect(toastCard).toBeVisible();
      await expect(
        toastCard.getByRole("button", { name: "Restore", exact: true }),
      ).toBeEnabled();
      await expect(
        toastCard.getByRole("button", { name: "Delete permanently", exact: true }),
      ).toBeEnabled();
      await toastCard
        .getByRole("button", { name: "Move", exact: true })
        .click();

      await modal(page).getByText("First collection", { exact: true }).click();
      await modal(page).getByRole("button", { name: "Move", exact: true }).click();

      await expect(
        collectionTable(page).getByText("Collection A", { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText("Dashboard A", { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText("Question A", { exact: true }),
      ).toHaveCount(0);

      await navigationSidebar(page)
        .getByText("First collection", { exact: true })
        .click();

      await expect(
        collectionTable(page).getByText("Collection A", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText("Dashboard A", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText("Question A", { exact: true }),
      ).toBeVisible();
    });

    test("user should be able to bulk delete", async ({ page }) => {
      await selectItem(page, "Dashboard A");
      await selectItem(page, "Question A");

      const toastCard = page.getByTestId("toast-card");
      await expect(toastCard).toBeVisible();
      await expect(
        toastCard.getByRole("button", { name: "Restore", exact: true }),
      ).toBeEnabled();
      await expect(
        toastCard.getByRole("button", { name: "Move", exact: true }),
      ).toBeEnabled();
      await toastCard
        .getByRole("button", { name: "Delete permanently", exact: true })
        .click();

      await expect(
        modal(page).getByText("Delete 2 items permanently?", { exact: true }),
      ).toBeVisible();
      await modal(page)
        .getByText("Delete permanently", { exact: true })
        .click();

      await expect(
        collectionTable(page).getByText("Collection A", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText("Dashboard A", { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText("Question A", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test("users should not be able to edit archived entities", async ({
    page,
    mb,
  }) => {
    const dashboard = await createDashboard(mb.api, { name: "Dashboard A" }, true);
    const question = await createQuestion(
      mb.api,
      {
        name: "Question A",
        query: { "source-table": 1, limit: 10 },
      },
      true,
    );

    await visitQuestion(page, question.id);
    const qbPanel = page.getByTestId("qb-header-action-panel");
    // should not have disabled actions in top navbar
    await expect(qbPanel.getByText("Filter", { exact: true })).toHaveCount(0);
    await expect(qbPanel.getByText("Summarize", { exact: true })).toHaveCount(0);
    await expect(qbPanel.getByTestId("notebook-button")).toHaveCount(0);
    await expect(icon(qbPanel, "bookmark")).toHaveCount(0);
    await expect(icon(qbPanel, "ellipsis")).toHaveCount(0);
    await expect(qbPanel.getByTestId("sharing-menu-button")).toHaveCount(0);

    // should not have disabled action in bottom footer
    await expect(
      page.getByTestId("view-footer").getByText("Visualization", { exact: true }),
    ).toHaveCount(0);

    await visitDashboard(page, mb.api, dashboard.id);
    const dashHeader = page.getByTestId("dashboard-header");
    await expect(icon(dashHeader, "pencil")).toHaveCount(0);
    await expect(dashHeader.getByTestId("sharing-menu-button")).toHaveCount(0);
    await expect(icon(dashHeader, "clock")).toHaveCount(0);
    await expect(icon(dashHeader, "bookmark")).toHaveCount(0);
    await expect(icon(dashHeader, "ellipsis")).toHaveCount(0);
  });

  test("user should not be shown restore/move/delete options in archive banner if they have view only permissions", async ({
    page,
    mb,
  }) => {
    const collection = await createCollection(mb.api, { name: "Collection A" });

    await createNativeQuestion(
      mb.api,
      {
        name: "Question A",
        native: { query: "select 1;" },
        collection_id: collection.id,
      },
      true,
    );
    await createDashboard(
      mb.api,
      { name: "Dashboard A", collection_id: collection.id },
      true,
    );

    await page.goto("/admin/permissions/collections");

    await selectSidebarItem(page, "Collection A");
    const COLLECTION_ACCESS_PERMISSION_INDEX = 0;

    await modifyPermission(
      page,
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "View",
    );
    await modifyPermission(
      page,
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "View",
    );
    await modifyPermission(
      page,
      "data",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "View",
    );

    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(
      modal(page).getByText("Save permissions?", { exact: true }),
    ).toBeVisible();
    await expect(
      modal(page).getByText("Are you sure you want to do this?", {
        exact: true,
      }),
    ).toBeVisible();
    await modal(page).getByRole("button", { name: "Yes", exact: true }).click();

    await archiveCollection(mb.api, collection.id);

    await mb.signInAsNormalUser();

    await visitCollection(page, collection.id);
    await expect(
      archiveBanner(page).getByText("Restore", { exact: true }),
    ).toHaveCount(0);
    await expect(
      archiveBanner(page).getByText("Move", { exact: true }),
    ).toHaveCount(0);
    await expect(
      archiveBanner(page).getByText("Delete permanently", { exact: true }),
    ).toHaveCount(0);
  });

  test("should hide read-only archived items in trash (metabase#24018)", async ({
    page,
    mb,
  }) => {
    const READ_ONLY_NAME = "read-only dashboard";
    const CURATEABLE_NAME = "curate-able dashboard";

    // setup archive with read-only collection items
    await createDashboard(
      mb.api,
      { name: READ_ONLY_NAME, collection_id: null },
      true,
    );

    // setup archive with curate-able collection items (user created items)
    await mb.signIn("readonly");

    await createDashboard(
      mb.api,
      { name: CURATEABLE_NAME, collection_id: READ_ONLY_PERSONAL_COLLECTION_ID },
      true,
    );

    // assert on desired behavior for read-only user
    await page.goto("/trash");
    await expect(
      main(page).getByText(READ_ONLY_NAME, { exact: true }),
    ).toHaveCount(0);
    await expect(
      main(page).getByText(CURATEABLE_NAME, { exact: true }),
    ).toBeVisible();

    // assert on desired behavior for admin user
    await mb.signInAsAdmin();
    await page.goto("/trash");
    await expect(
      main(page).getByText(READ_ONLY_NAME, { exact: true }),
    ).toBeVisible();
    await expect(
      main(page).getByText(CURATEABLE_NAME, { exact: true }),
    ).toBeVisible();
  });

  test("should highlight the trash in the navbar when viewing root trash collection or an entity in the trash", async ({
    page,
    mb,
  }) => {
    const collection = await createCollection(mb.api, { name: "Collection A" }, true);
    const dashboard = await createDashboard(mb.api, { name: "Dashboard A" }, true);
    const question = await createNativeQuestion(
      mb.api,
      { name: "Question A", native: { query: "select 1;" } },
      true,
    );

    // Make sure trash is selected for root trash collection
    await page.goto("/trash");
    await assertTrashSelectedInNavigationSidebar(page);

    // Make sure trash is selected for a trashed collection
    await visitCollection(page, collection.id);
    await assertTrashSelectedInNavigationSidebar(page);

    // Make sure trash is selected for a trashed dashboard
    await visitDashboard(page, mb.api, dashboard.id);
    await assertTrashSelectedInNavigationSidebar(page);

    // Make sure trash is selected for a trashed question
    await visitQuestion(page, question.id);
    await assertTrashSelectedInNavigationSidebar(page);
  });

  test.describe("sidebar drag and drop", () => {
    test("should not allow items in the trash to be moved into the trash", async ({
      page,
      mb,
    }) => {
      await createDashboard(mb.api, { name: "Dashboard A" }, true);
      const updates = countRequests(page, isDashboardPut);
      await page.goto("/trash");

      await dragAndDrop(
        page,
        main(page).getByText("Dashboard A", { exact: true }),
        navigationSidebar(page).getByText("Trash", { exact: true }),
      );

      // small wait to make sure a network request could have gone out
      await page.waitForTimeout(100);
      expect(updates.count()).toBe(0);
      await expect(page.getByTestId("toast-undo")).toHaveCount(0);
      await expect(
        main(page).getByText(/Deleted items will appear here/),
      ).toHaveCount(0);
      await expect(
        main(page).getByText("Dashboard A", { exact: true }),
      ).toBeVisible();
    });

    test("should allow items in the trash to be moved out of the trash and allow it to be undone", async ({
      page,
      mb,
    }) => {
      await createDashboard(mb.api, { name: "Dashboard A" }, true);
      const updates = countRequests(page, isDashboardPut);
      await page.goto("/trash");

      await dragAndDrop(
        page,
        main(page).getByText("Dashboard A", { exact: true }),
        navigationSidebar(page).getByText("First collection", { exact: true }),
      );

      await expect.poll(() => updates.count()).toBe(1);
      await expect(
        main(page).getByText(/Deleted items will appear here/),
      ).toBeVisible();
      await expect(page.getByTestId("toast-undo")).toBeVisible();
      await undo(page);

      await expect.poll(() => updates.count()).toBe(2);
      await expect(
        main(page).getByText(/Deleted items will appear here/),
      ).toHaveCount(0);
      await expect(
        main(page).getByText("Dashboard A", { exact: true }),
      ).toBeVisible();
    });

    test("should allow items outside the trash to be moved in the trash and allow it to be undone", async ({
      page,
      mb,
    }) => {
      await createDashboard(mb.api, {
        name: "Dashboard A",
        collection_id: FIRST_COLLECTION_ID,
      });
      const updates = countRequests(page, isDashboardPut);
      await visitCollection(page, FIRST_COLLECTION_ID);

      await dragAndDrop(
        page,
        main(page).getByText("Dashboard A", { exact: true }),
        navigationSidebar(page).getByText("Trash", { exact: true }),
      );

      await expect.poll(() => updates.count()).toBe(1);
      await expect(
        main(page).getByText("Dashboard A", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByTestId("toast-undo")).toBeVisible();
      await undo(page);

      await expect.poll(() => updates.count()).toBe(2);
      await expect(
        main(page).getByText("Dashboard A", { exact: true }),
      ).toBeVisible();
    });
  });

  test("should open only one context menu at a time (metabase#44910)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { archived: true });
    await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      archived: true,
    });
    await page.goto("/trash");

    await toggleEllipsisMenuFor(page, "Orders");
    await expect(page.getByRole("menu")).toHaveCount(1);
    await expect(page.getByRole("menu")).toContainText("Move");
    await expect(page.getByRole("menu")).toContainText("Restore");
    await expect(page.getByRole("menu")).toContainText("Delete permanently");

    await toggleEllipsisMenuFor(page, "Orders, Count");
    await expect(page.getByRole("menu")).toHaveCount(1);
    await expect(page.getByRole("menu")).toContainText("Move");
    await expect(page.getByRole("menu")).toContainText("Restore");
    await expect(page.getByRole("menu")).toContainText("Delete permanently");
  });

  test("should not deselect items when aborting operations (metabase#44911)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { archived: true });
    await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      archived: true,
    });
    await mb.api.put(`/api/card/${ORDERS_MODEL_ID}`, { archived: true });
    await page.goto("/trash");

    await selectItem(page, "Orders");
    await selectItem(page, "Orders Model");

    const toastCard = page.getByTestId("toast-card");
    await expect(toastCard).toBeVisible();
    await toastCard
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();

    await modal(page).getByText("Cancel", { exact: true }).click();

    await assertChecked(page, "Orders");
    await assertChecked(page, "Orders Model");

    await expect(toastCard).toBeVisible();
    await toastCard.getByRole("button", { name: "Move", exact: true }).click();

    await entityPickerModal(page).getByText("Cancel", { exact: true }).click();

    await assertChecked(page, "Orders");
    await assertChecked(page, "Orders Model");

    // Going through with action should reset selection
    await expect(toastCard).toBeVisible();
    await toastCard
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();

    await modal(page).getByText("Delete permanently", { exact: true }).click();
    await assertChecked(page, "Orders, Count", false);
  });
});
