/**
 * Playwright port of e2e/test/scenarios/organization/bookmarks-collection.cy.spec.js
 *
 * Port notes:
 * - Snowplow assertions are real, backed by the per-slot collector via
 *   ../support/snowplow; the UI flows in those tests are ported for real too.
 * - "removes items from bookmarks list when they are archived" now asserts
 *   the Bookmarks section actually disappears after each archive — the
 *   Cypress original never checked the removal it was named after.
 * - The question in the metabase#44499 test targets
 *   SAMPLE_DATABASE.ORDERS_ID (spike convention) instead of the equivalent
 *   STATIC_ORDERS_ID from cypress_data.
 */
import type { Page } from "@playwright/test";

import { openPinnedItemMenu } from "../support/collections";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import {
  enableTracking,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { openCollectionItemMenu } from "../support/bookmarks-extras";
import { tableHeaderColumn } from "../support/notebook";
import { getSidebarSectionTitle } from "../support/organization";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { visitCollection } from "../support/question-new";
import { FIRST_COLLECTION_ID, SAMPLE_DATABASE } from "../support/sample-data";
import { navigationSidebar, popover, sidebarSection } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

const adminPersonalCollectionName = "Bobby Tables's Personal Collection";

test.describe("scenarios > organization > bookmarks > collection", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test("cannot add bookmark to root collection", async ({ page }) => {
    await visitCollection(page, "root");

    await expect(getSidebarSectionTitle(page, /^Collections$/)).toBeVisible();
    await expect(icon(page, "bookmark")).toHaveCount(0);
  });

  test("can add, update bookmark name when collection name is updated, and remove bookmarks from collection from its page", async ({
    page,
    mb,
  }) => {
    await visitCollection(page, FIRST_COLLECTION_ID);

    // Add bookmark
    await icon(page, "bookmark").click();

    await expectUnstructuredSnowplowEvent(mb, {
      event: "bookmark_added",
      event_detail: "collection",
      triggered_from: "collection_header",
    });

    const sidebar = navigationSidebar(page);
    await expect(getSidebarSectionTitle(page, /Bookmarks/)).toBeVisible();
    await expect(
      sidebar.getByText("First collection", { exact: true }),
    ).toHaveCount(2);
    // Once there is a list of bookmarks, we add a heading to the list of
    // collections below the list of bookmarks
    await expect(getSidebarSectionTitle(page, /^Collections$/)).toBeVisible();

    // Rename bookmarked collection. Clicking the title swaps in a focused
    // textbox whose accessible name ("Add title") comes from its placeholder.
    await page.getByTestId("collection-name-heading").click();
    const titleInput = page.getByRole("textbox", { name: "Add title" });
    await expect(titleInput).toHaveValue("First collection");
    await titleInput.press("End");
    await titleInput.pressSequentially(" 2");
    // Anchor the rename on its PUT — blur alone can race the re-render.
    const renamed = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/collection\/\d+$/.test(new URL(response.url()).pathname),
    );
    await titleInput.blur();
    await renamed;

    await expect(
      sidebar.getByText("First collection 2", { exact: true }),
    ).toHaveCount(2);

    // Remove bookmark
    const collectionMenu = page.getByTestId("collection-menu");
    await icon(collectionMenu, "bookmark_filled").click();

    await expect(
      sidebar.getByText("First collection 2", { exact: true }),
    ).toHaveCount(1);

    await expect(icon(collectionMenu, "bookmark_filled")).toHaveCount(0);
    await expect(icon(collectionMenu, "bookmark")).toBeVisible();
  });

  test("removes items from bookmarks list when they are archived", async ({
    page,
  }) => {
    // A question
    await bookmarkThenArchive(page, "Orders");

    // A dashboard
    await bookmarkThenArchive(page, "Orders in a dashboard");
  });

  test("should update bookmarks list when restoring a collection containing bookmarked items (metabase#44499)", async ({
    page,
    mb,
  }) => {
    const collectionName = "First collection";
    const questionName = "Orders in First Collection";

    // Create a question in the collection and bookmark it
    const { id: questionId } = await mb.api.createQuestion({
      name: questionName,
      query: { "source-table": ORDERS_ID },
      collection_id: FIRST_COLLECTION_ID,
    });
    await mb.api.bookmarkCard(questionId);

    await visitCollection(page, "root");

    // Verify bookmark appears in sidebar
    await expect(sidebarSection(page, "Bookmarks")).toContainText(questionName);

    // Archive the collection
    await openCollectionItemMenu(page, collectionName);
    await popover(page).getByText("Move to trash", { exact: true }).click();

    // The bookmarked question should be removed from bookmarks
    await expect(sidebarSection(page, "Bookmarks")).toHaveCount(0);

    // Restore the collection
    await page.goto("/trash");
    await openCollectionItemMenu(page, collectionName);
    await popover(page).getByText("Restore", { exact: true }).click();

    // The bookmarked question should reappear in bookmarks
    await expect(sidebarSection(page, "Bookmarks")).toContainText(questionName);
  });

  test("can remove bookmark from item in sidebar", async ({ page }) => {
    await visitCollection(page, ADMIN_PERSONAL_COLLECTION_ID);

    // Add bookmark
    await icon(page.getByTestId("collection-menu"), "bookmark").click();

    const sidebar = navigationSidebar(page);
    // The remove-bookmark icon is hover-gated (Cypress force-clicked it).
    await sidebar
      .getByText(adminPersonalCollectionName, { exact: true })
      .hover();
    await icon(sidebar, "bookmark_filled").click();

    await expect(getSidebarSectionTitle(page, /Bookmarks/)).toHaveCount(0);
  });

  test("can toggle bookmark list visibility", async ({ page }) => {
    await visitCollection(page, ADMIN_PERSONAL_COLLECTION_ID);

    // Add bookmark
    await icon(page, "bookmark").click();

    const sidebar = navigationSidebar(page);
    await getSidebarSectionTitle(page, /Bookmarks/).click();

    await expect(
      sidebar.getByText(adminPersonalCollectionName, { exact: true }),
    ).toHaveCount(0);

    await getSidebarSectionTitle(page, /Bookmarks/).click();

    await expect(
      sidebar.getByText(adminPersonalCollectionName, { exact: true }),
    ).toBeVisible();
  });

  test.describe("collection items", () => {
    test("can add/remove bookmark from unpinned Question in collection", async ({
      page,
      mb,
    }) => {
      await addBookmarkTo(page, "Orders");
      await expectUnstructuredSnowplowEvent(mb, {
        event: "bookmark_added",
        event_detail: "question",
        triggered_from: "collection_list",
      });
      await removeBookmarkFrom(page, "Orders");
      await expectUnstructuredSnowplowEvent(
        mb,
        {
          event: "bookmark_added",
          event_detail: "question",
          triggered_from: "collection_list",
        },
        1,
      );
    });

    test("can add/remove bookmark from pinned Question in collection", async ({
      page,
      mb,
    }) => {
      const name = "Orders";
      await visitCollection(page, "root");

      await pin(page, name);
      await expect(tableHeaderColumn(page, "ID")).toBeVisible();
      await bookmarkPinnedItem(page, name);

      await expectUnstructuredSnowplowEvent(mb, {
        event: "bookmark_added",
        event_detail: "question",
        triggered_from: "collection_list",
      });
    });

    test("can add/remove bookmark from unpinned Dashboard in collection", async ({
      page,
      mb,
    }) => {
      await addBookmarkTo(page, "Orders in a dashboard");
      await expectUnstructuredSnowplowEvent(mb, {
        event: "bookmark_added",
        event_detail: "dashboard",
        triggered_from: "collection_list",
      });
      await removeBookmarkFrom(page, "Orders in a dashboard");
      await expectUnstructuredSnowplowEvent(
        mb,
        {
          event: "bookmark_added",
          event_detail: "dashboard",
          triggered_from: "collection_list",
        },
        1,
      );
    });

    test("can add/remove bookmark from pinned Dashboard in collection", async ({
      page,
      mb,
    }) => {
      const name = "Orders in a dashboard";
      await visitCollection(page, "root");

      await pin(page, name);
      await expect(page.getByText("A dashboard", { exact: true })).toBeVisible();
      await bookmarkPinnedItem(page, name);
      await expectUnstructuredSnowplowEvent(mb, {
        event: "bookmark_added",
        event_detail: "dashboard",
        triggered_from: "collection_list",
      });
    });

    test("adds and removes bookmarks from Model in collection", async ({
      page,
      mb,
    }) => {
      // The default snapshot already ships an "Orders Model" in the root
      // collection; this creates a second one, matching the Cypress spec
      // (its openCollectionItemMenu picked the first name match, as ours does).
      await mb.api.createQuestion({
        name: "Orders Model",
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
        type: "model",
      });

      await addBookmarkTo(page, "Orders Model");
      await expectUnstructuredSnowplowEvent(mb, {
        event: "bookmark_added",
        event_detail: "model",
        triggered_from: "collection_list",
      });

      await removeBookmarkFrom(page, "Orders Model");
      await expectUnstructuredSnowplowEvent(
        mb,
        {
          event: "bookmark_added",
          event_detail: "model",
          triggered_from: "collection_list",
        },
        1,
      );
    });

    test("can bookmark a collection", async ({ page, mb }) => {
      const collectionName = "First collection";

      await addBookmarkTo(page, collectionName);
      await expectUnstructuredSnowplowEvent(mb, {
        event: "bookmark_added",
        event_detail: "collection",
        triggered_from: "collection_list",
      });

      await removeBookmarkFrom(page, collectionName);
      await expectUnstructuredSnowplowEvent(
        mb,
        {
          event: "bookmark_added",
          event_detail: "collection",
          triggered_from: "collection_list",
        },
        1,
      );
    });
  });
});

async function addBookmarkTo(page: Page, name: string) {
  await visitCollection(page, "root");

  await openCollectionItemMenu(page, name);
  await popover(page).getByText("Bookmark", { exact: true }).click();

  await expect(sidebarSection(page, "Bookmarks")).toContainText(name);
}

async function removeBookmarkFrom(page: Page, name: string) {
  await openCollectionItemMenu(page, name);

  await popover(page)
    .getByText("Remove from bookmarks", { exact: true })
    .click();

  await expect(sidebarSection(page, "Bookmarks")).toHaveCount(0);
}

async function bookmarkThenArchive(page: Page, name: string) {
  await addBookmarkTo(page, name);
  await archive(page, name);
  // Not in the Cypress original (which asserted nothing after archiving):
  // the archived item's bookmark must be gone.
  await expect(sidebarSection(page, "Bookmarks")).toHaveCount(0);
}

async function pin(page: Page, name: string) {
  await openCollectionItemMenu(page, name);
  await popover(page).getByText("Pin this", { exact: true }).click();
}

async function archive(page: Page, name: string) {
  await openCollectionItemMenu(page, name);
  await popover(page).getByText("Move to trash", { exact: true }).click();
}

async function bookmarkPinnedItem(page: Page, name: string) {
  await openPinnedItemMenu(page, name);
  await popover(page).getByText("Bookmark", { exact: true }).click();

  await expect(getSidebarSectionTitle(page, /Bookmarks/)).toBeVisible();
  await expect(
    navigationSidebar(page).getByText(name, { exact: true }),
  ).toBeVisible();
}
