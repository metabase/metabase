/**
 * Playwright port of e2e/test/scenarios/collections/collections.cy.spec.js
 *
 * Port notes:
 * - Snowplow helpers ("new collection button" describe) are no-op stubs — the
 *   spike harness has no snowplow-micro container (PORTING.md rule 6). The UI
 *   flows in those tests are ported for real.
 * - The Cypress beforeEach intercepts become per-test waitForResponse promises
 *   registered before their triggering action. `@getPinnedItems` was never
 *   awaited in the source, so it is dropped.
 * - visitRootCollection (two spec-local variants, both "visit + wait for two
 *   root-items loads") maps to visitCollection(page, "root").
 * - HTML5 drag/drop reuses support/collections.ts dragAndDrop (rule: never port
 *   the bare Cypress 3-event sequence).
 * - Response-modifying intercepts (the "render last edited by" tests, the
 *   "Ryan said no" 500) are ported with page.route.
 */
import type { Page } from "@playwright/test";

import {
  archiveAll,
  assertCollectionItemsOrder,
  assertSelectAllIsIndeterminate,
  ALL_USERS_GROUP_ID,
  closeNavigationSidebar,
  DATA_GROUP,
  displaySidebarChildOf,
  ensureCollectionHasNoChildren,
  ensureCollectionIsExpanded,
  FIRST_COLLECTION_ENTITY_ID,
  findPickerItem,
  getRowCheckbox,
  moveItemToCollection,
  moveOpenedCollectionTo,
  openCollectionMenu,
  openEllipsisMenuFor,
  selectItemUsingCheckbox,
  toggleSortingFor,
  waitForCollectionItems,
} from "../support/collections-core";
import { updateCollectionGraph } from "../support/click-behavior";
import {
  dragAndDrop,
  getPinnedSection,
  openUnpinnedItemMenu,
} from "../support/collections";
import { createCollection } from "../support/dashboard-core";
import { pickEntity } from "../support/dashboard";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import { READ_ONLY_PERSONAL_COLLECTION_ID } from "../support/documents-core";
import { test, expect } from "../support/fixtures";
import { entityPickerModal } from "../support/notebook";
import { openCollectionItemMenu } from "../support/bookmarks-extras";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { openOrdersTable } from "../support/question-settings";
import {
  SECOND_COLLECTION_ID,
  entityPickerModalItem,
  visitCollection,
} from "../support/question-new";
import { sidesheet } from "../support/revisions";
import {
  FIRST_COLLECTION_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
  THIRD_COLLECTION_ID,
} from "../support/sample-data";
import type { UserName } from "../support/sample-data";
import { createNativeQuestion, main } from "../support/sharing";
import {
  collectionTable,
  icon,
  modal,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  visitQuestion,
} from "../support/ui";

const { ORDERS, ORDERS_ID, FEEDBACK_ID } = SAMPLE_DATABASE;

// nocollection = { first_name: "No Collection", last_name: "Tableton" }
const revokedUsersPersonalCollectionName =
  "No Collection Tableton's Personal Collection";

// TODO: no snowplow-micro container in the spike harness (PORTING.md rule 6).
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

const visitRootCollection = (page: Page) => visitCollection(page, "root");

// The pagination range renders as `{n} - {m}` text nodes inside a span that
// also holds the "of {total}" child spans — testing-library matched the direct
// text nodes ("1 - 25"), but Playwright's getByText sees the element's full
// text ("1 - 25 of 30"). Assert a substring on the pagination container
// instead (PORTING.md mixed-content-text-nodes gotcha).
const expectPaginationRange = (page: Page, range: string) =>
  expect(page.getByLabel("pagination")).toContainText(range);

const waitForCreateCollection = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/collection",
  );

test.describe("scenarios > collection defaults", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("new collection button", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await resetSnowplow();
      await mb.signInAsAdmin();
      await enableTracking();
    });

    test.afterEach(async () => {
      await expectNoBadSnowplowEvents();
    });

    test("should show the new collection button in the root collection", async ({
      page,
    }) => {
      await visitRootCollection(page);
      await page
        .getByTestId("collection-menu")
        .getByLabel("Create a new collection", { exact: true })
        .click();

      await expectUnstructuredSnowplowEvent({
        event: "plus_button_clicked",
        triggered_from: "collection-header",
      });

      const newCollectionModal = page.getByTestId("new-collection-modal");
      await newCollectionModal.getByLabel("Name", { exact: true }).fill("MCL");
      await expect(
        newCollectionModal.getByTestId("collection-picker-button"),
      ).toContainText("Our analytics");

      const createCollectionRequest = waitForCreateCollection(page);
      await newCollectionModal
        .getByRole("button", { name: "Create", exact: true })
        .click();
      await createCollectionRequest;

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(/^\/collection\/\d+-mcl/);
      await expect(page.getByTestId("collection-empty-state")).toBeVisible();

      await expect(
        page
          .getByTestId("collection-menu")
          .getByLabel("Create a new collection", { exact: true }),
      ).toBeVisible();

      await navigationSidebar(page)
        .getByLabel("Create a new collection", { exact: true })
        .click();
      // The new-collection-modal testid sits on the Mantine Modal root (a
      // hidden wrapper), so assert the visible dialog itself. A closed modal
      // from the first creation can linger, so scope to the visible one.
      await expect(
        page
          .getByRole("dialog", { name: "New collection" })
          .filter({ visible: true }),
      ).toBeVisible();
      await expectUnstructuredSnowplowEvent({
        event: "plus_button_clicked",
        triggered_from: "collection-nav",
      });
    });

    test("user without curate permissions should only be allowed to create a new collection inside their personal collection scope", async ({
      page,
      mb,
    }) => {
      await mb.signIn("readonly");
      await visitRootCollection(page);
      await expect(
        page
          .getByTestId("collection-menu")
          .getByLabel("Create a new collection", { exact: true }),
      ).toHaveCount(0);

      await visitCollection(page, READ_ONLY_PERSONAL_COLLECTION_ID);

      await page
        .getByTestId("collection-menu")
        .getByLabel("Create a new collection", { exact: true })
        .click();

      const newCollectionModal = page.getByTestId("new-collection-modal");
      await newCollectionModal.getByLabel("Name", { exact: true }).fill("sub");
      await expect(
        newCollectionModal.getByTestId("collection-picker-button"),
      ).toContainText("Read Only Tableton's Personal Collection");

      const createCollectionRequest = waitForCreateCollection(page);
      await newCollectionModal
        .getByRole("button", { name: "Create", exact: true })
        .click();
      await createCollectionRequest;

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(/^\/collection\/\d+-sub/);
      await expect(page.getByTestId("collection-empty-state")).toBeVisible();

      await expect(
        page
          .getByTestId("collection-menu")
          .getByLabel("Create a new collection", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("new collection modal", () => {
    test("should be usable on small screens", async ({ page, mb }) => {
      const COLLECTIONS_COUNT = 5;
      for (let index = 0; index < COLLECTIONS_COUNT; index++) {
        await mb.api.post("/api/collection", {
          name: `Collection ${index + 1}`,
          parent_id: null,
        });
      }

      await page.goto("/");
      await page.setViewportSize({ width: 800, height: 500 });

      await navigationSidebar(page)
        .getByLabel("Create a new collection", { exact: true })
        .click();

      const newCollectionModal = page.getByTestId("new-collection-modal");
      await newCollectionModal
        .getByPlaceholder("My new fantastic collection")
        .fill("Test collection");
      await newCollectionModal
        .getByLabel("Description", { exact: true })
        .fill("Test collection description");
      await newCollectionModal
        .getByTestId("collection-picker-button")
        .getByText("Our analytics", { exact: true })
        .click();

      await pickEntity(page, {
        path: ["Our analytics", `Collection ${COLLECTIONS_COUNT}`],
        select: true,
      });

      await newCollectionModal
        .getByRole("button", { name: "Create", exact: true })
        .click();

      await expect(page.getByTestId("collection-name-heading")).toHaveText(
        "Test collection",
      );
    });
  });

  test.describe("sidebar behavior", () => {
    test("should navigate effortlessly through collections tree", async ({
      page,
    }) => {
      await visitRootCollection(page);

      const sidebar = navigationSidebar(page);

      // click the chevron to expand the sub collection without navigating to it
      await displaySidebarChildOf(page, "First collection");
      await expect(
        sidebar.getByText("Second collection", { exact: true }),
      ).toBeVisible();
      await expect(
        sidebar.getByText("Third collection", { exact: true }),
      ).toHaveCount(0);
      // we should not have navigated away
      await expect.poll(() => new URL(page.url()).pathname).toBe(
        "/collection/root",
      );

      // expand/collapse collection tree by clicking on parent collection name
      // (metabase#17339)
      await sidebar.getByText("Second collection", { exact: true }).click();
      await expect(
        sidebar.getByText("Third collection", { exact: true }),
      ).toBeVisible();

      await sidebar.getByText("Second collection", { exact: true }).click();
      await expect(
        sidebar.getByText("Third collection", { exact: true }),
      ).toHaveCount(0);

      await sidebar.getByText("First collection", { exact: true }).click();
      await expect(
        sidebar.getByText("Second collection", { exact: true }),
      ).toBeVisible();
      await sidebar.getByText("First collection", { exact: true }).click();
      await expect(
        sidebar.getByText("Second collection", { exact: true }),
      ).toHaveCount(0);
      await expect(
        sidebar.getByText("Third collection", { exact: true }),
      ).toHaveCount(0);

      // navigating directly to a collection should expand it and show children
      await visitCollection(page, SECOND_COLLECTION_ID);

      await expect(
        sidebar.getByText("Second collection", { exact: true }),
      ).toBeVisible();
      await expect(
        sidebar.getByText("Third collection", { exact: true }),
      ).toBeVisible();

      // Collections without sub-collections shouldn't have chevron icon
      // (metabase#14753)
      await ensureCollectionHasNoChildren(page, "Third collection");
      await ensureCollectionHasNoChildren(page, "Your personal collection");
    });

    test("should correctly display deep nested collections with long names", async ({
      page,
      mb,
    }) => {
      // Create two more nested collections
      const names = [
        "Fourth collection",
        "Fifth collection with a very long name",
      ];
      for (const [index, collection] of names.entries()) {
        await mb.api.post("/api/collection", {
          name: collection,
          parent_id: THIRD_COLLECTION_ID + index,
        });
      }

      await visitCollection(page, THIRD_COLLECTION_ID);

      // Expand so that the deeply nested collection is showing
      await displaySidebarChildOf(page, "Fourth collection");

      // Ensure we show the helpful tooltip with the full (long) collection name
      await page
        .getByText("Fifth collection with a very long name", { exact: true })
        .hover();
      await expect(
        page.getByRole("tooltip", {
          name: /Fifth collection with a very long name/,
        }),
      ).toBeVisible();
    });

    test("should be usable on mobile screen sizes (metabase#15006)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 480, height: 800 });

      await visitRootCollection(page);

      // should be able to toggle the sidebar on a mobile screen size
      await expect(navigationSidebar(page)).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      await openNavigationSidebar(page);

      await closeNavigationSidebar(page);
      await expect(navigationSidebar(page)).toHaveAttribute(
        "aria-hidden",
        "true",
      );

      // should close the sidebar when a collection is clicked on mobile
      await openNavigationSidebar(page);

      await navigationSidebar(page)
        .getByText("First collection", { exact: true })
        .click();

      await expect(page.getByTestId("collection-name-heading")).toHaveText(
        "First collection",
      );

      await expect(navigationSidebar(page)).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });
  });

  test("should support markdown in collection description", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/collection/${SECOND_COLLECTION_ID}`, {
      description: "[link](https://metabase.com)",
    });

    await visitCollection(page, FIRST_COLLECTION_ID);

    const row = page
      .getByRole("table")
      .getByRole("row")
      .filter({ has: page.getByText("Second collection", { exact: true }) });
    await icon(row, "info").hover();

    const tooltip = page.getByRole("tooltip");
    await expect(tooltip.getByRole("link")).toContainText("link");
    await expect(tooltip.getByRole("link")).not.toContainText("[link]");
  });

  test("should allow description to be edited in the sidesheet", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/collection/${FIRST_COLLECTION_ID}`, {
      description: "[link](https://metabase.com)",
    });

    await visitCollection(page, FIRST_COLLECTION_ID);

    // Description visible in collection caption
    const caption = page.getByTestId("collection-caption");
    const captionDescription = caption.getByTestId("editable-text").nth(1);
    await expect(captionDescription.getByRole("link")).toHaveText("link");
    await expect(captionDescription.getByRole("link")).toHaveAttribute(
      "href",
      "https://metabase.com",
    );

    const toggleSidesheet = () =>
      icon(page.getByTestId("collection-menu"), "info").click();

    // Let's edit the description
    await toggleSidesheet();
    const sheet = sidesheet(page);
    await sheet.getByTestId("editable-text").click();
    const editor = sheet.getByRole("textbox");
    await expect(editor).toBeFocused();
    await page.keyboard.type("edited ");
    await page.keyboard.press("Tab");
    await sheet.getByLabel("Close", { exact: true }).click();

    // The edited description is visible in the collection caption
    await expect(caption.getByTestId("editable-text").nth(1)).toHaveText(
      "edited link",
    );

    // The edited description is visible in the sidesheet
    await toggleSidesheet();
    await expect(sidesheet(page).getByTestId("editable-text")).toHaveText(
      "edited link",
    );
  });

  test.describe("render last edited by when names are null", () => {
    const stubDashboardLastEditInfo = async (page: Page, email: string) => {
      await page.route(
        (url) =>
          url.pathname === "/api/collection/root/items" &&
          url.searchParams.get("models") === "dashboard",
        async (route) => {
          const response = await route.fetch();
          const json = await response.json();
          json.data[0]["last-edit-info"] = {
            id: 1,
            last_name: null,
            first_name: null,
            email,
            timestamp: "2022-07-05T07:31:09.054-07:00",
          };
          await route.fulfill({ response, json });
        },
      );
    };

    test("should render short value without tooltip", async ({ page }) => {
      await stubDashboardLastEditInfo(page, "me@email.com");
      await visitRootCollection(page);
      await page.getByText("me@email.com", { exact: true }).hover();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    });

    test("should render long value with tooltip", async ({ page }) => {
      const email = "averyverylongemail@veryverylongdomain.com";
      await stubDashboardLastEditInfo(page, email);
      await visitRootCollection(page);
      await page.getByText(email, { exact: true }).hover();
      await expect(page.getByRole("tooltip")).toBeVisible();
    });
  });

  test("should not show you the parent collection in recents or search results", async ({
    page,
  }) => {
    await visitCollection(page, THIRD_COLLECTION_ID);
    await openCollectionMenu(page);
    await popover(page).getByText("Move", { exact: true }).click();

    const pickerModal = entityPickerModal(page);
    // wait for collections to load before clicking recents to prevent flakiness
    await expect(
      pickerModal.getByText("Third collection", { exact: true }),
    ).toBeVisible();
    await pickerModal.getByText("Recent items", { exact: true }).click();
    // the space is important: search results are "[name] [parent name]"
    await expect(
      pickerModal.getByRole("link", { name: /First collection / }),
    ).toBeVisible();
    await expect(
      pickerModal.getByRole("link", { name: /Second collection / }),
    ).toHaveCount(0);

    await pickerModal.getByPlaceholder("Search…").pressSequentially("coll");
    await expect(
      pickerModal.getByRole("link", { name: /Robert Tableton's / }),
    ).toBeVisible();
    await expect(
      pickerModal.getByRole("link", { name: /Second collection / }),
    ).toHaveCount(0);
  });

  test.describe("Collection related issues reproductions", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should handle moving a question when you don't have access to entire collection path (metabase#44316", async ({
      page,
      mb,
    }) => {
      const collectionA = await createCollection(mb.api, {
        name: "Collection A",
      });
      const collectionB = await createCollection(mb.api, {
        name: "Collection B",
        parent_id: collectionA.id,
      });
      const collectionC = await createCollection(mb.api, {
        name: "Collection C",
        parent_id: collectionB.id,
      });
      const collectionD = await createCollection(mb.api, {
        name: "Collection D",
        parent_id: collectionC.id,
      });
      const collectionE = await createCollection(mb.api, {
        name: "Collection E",
        parent_id: collectionD.id,
      });

      await updatePermissionsGraph(mb.api, {
        [ALL_USERS_GROUP_ID]: {
          [SAMPLE_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": "query-builder-and-native",
          },
        },
      });
      await updateCollectionGraph(mb.api, {
        [ALL_USERS_GROUP_ID]: {
          root: "none",
          [collectionA.id]: "none",
          [collectionB.id]: "write",
          [collectionC.id]: "none",
          [collectionD.id]: "none",
          [collectionE.id]: "write",
        },
      });

      await mb.signIn("none" as UserName);
      const { id: questionId } = await mb.api.createQuestion({
        name: "Foo Question",
        query: { "source-table": FEEDBACK_ID },
        collection_id: collectionE.id,
      });
      await visitQuestion(page, questionId);

      await icon(page.getByTestId("qb-header"), "ellipsis").click();
      await popover(page).getByText("Move", { exact: true }).click();
      await expect(
        entityPickerModalItem(page, 1, "Collection B"),
      ).toBeVisible();
      await expect(
        entityPickerModalItem(page, 2, "Collection E"),
      ).toBeVisible();

      await expect(entityPickerModal(page)).not.toContainText(
        "You don't have permissions to do that.",
      );
    });

    test("should show list of collection items even if one question has invalid parameters (metabase#25543)", async ({
      page,
      mb,
    }) => {
      await createNativeQuestion(mb.api, {
        native: { query: "select 1 --[[]]", "template-tags": {} },
      });

      await visitRootCollection(page);
      await expect(
        page.getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to drag an item to the root collection (metabase#16498)", async ({
      page,
      mb,
    }) => {
      await moveItemToCollection(mb.api, "Orders", "First collection");

      await visitCollection(page, FIRST_COLLECTION_ID);

      const dragSubject = collectionTable(page).getByText("Orders", {
        exact: true,
      });
      const dropTarget = navigationSidebar(page).getByText("Our analytics", {
        exact: true,
      });

      await dragAndDrop(page, dragSubject, dropTarget);

      await expect(
        page.getByText("Moved question", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText("Orders", { exact: true }),
      ).toHaveCount(0);

      await visitRootCollection(page);
      await expect(
        collectionTable(page).getByText("Orders", { exact: true }),
      ).toBeVisible();
    });

    test.describe("nested collections with revoked parent access", () => {
      test.beforeEach(async ({ mb }) => {
        // Create Parent collection within `Our analytics`
        const parentResponse = await mb.api.post("/api/collection", {
          name: "Parent",
          parent_id: null,
        });
        const { id: parentCollectionId } = await parentResponse.json();
        // Create Child collection within Parent collection
        const childResponse = await mb.api.post("/api/collection", {
          name: "Child",
          parent_id: parentCollectionId,
        });
        const { id: childCollectionId } = await childResponse.json();

        // Give `Data` group permission to "curate" Child collection only
        const graphResponse = await mb.api.get("/api/collection/graph");
        const { groups, revision } = await graphResponse.json();
        groups[DATA_GROUP] = {};
        groups[DATA_GROUP][childCollectionId] = "write";
        await mb.api.put("/api/collection/graph", { groups, revision });

        await mb.signOut();
        await mb.signIn("nocollection" as UserName);
      });

      test("should see a child collection in a sidebar even with revoked access to its parents (metabase#14114, metabase#16555, metabase#20716)", async ({
        page,
      }) => {
        await page.goto("/");

        const sidebar = navigationSidebar(page);
        await expect(
          sidebar.getByText("Our analytics", { exact: true }),
        ).toHaveCount(0);
        await expect(
          sidebar.getByText("Parent", { exact: true }),
        ).toHaveCount(0);
        await expect(sidebar.getByText("Child", { exact: true })).toBeVisible();
        await expect(
          sidebar.getByText("Your personal collection", { exact: true }),
        ).toBeVisible();

        // Even navigating directly to root must not show its content
        await page.goto("/collection/root");
        await expect(
          page.getByText("You don't have permissions to do that.", {
            exact: true,
          }),
        ).toBeVisible();
      });

      test("should be able to choose a child collection when saving a question (metabase#14052)", async ({
        page,
      }) => {
        await openOrdersTable(page);
        await page.getByText("Save", { exact: true }).click();
        // Choose which collection this question should be saved to
        await page
          .getByText(revokedUsersPersonalCollectionName, { exact: true })
          .click();
        await pickEntity(page, { path: [revokedUsersPersonalCollectionName] });
        await pickEntity(page, { path: ["Collections", "Child"] });
        await expect(
          entityPickerModal(page).getByRole("button", {
            name: "Select this collection",
            exact: true,
          }),
        ).toBeEnabled();
        // Reported failing from v0.34.3
        await expect(
          page.getByTestId("entity-picker-modal").getByText("Parent", {
            exact: true,
          }),
        ).toHaveCount(0);
      });
    });

    test("sub-collection should be available in save and move modals (metabase#14122)", async ({
      page,
      mb,
    }) => {
      const COLLECTION = "14122C";

      // Create Parent collection within admin's personal collection
      await createCollection(mb.api, {
        name: COLLECTION,
        parent_id: ADMIN_PERSONAL_COLLECTION_ID,
      });

      await visitRootCollection(page);

      await openEllipsisMenuFor(page, "Orders");
      await popover(page).getByText("Move", { exact: true }).click();

      const pickerModal = entityPickerModal(page);
      await pickerModal
        .getByText("Bobby Tables's Personal Collection", { exact: true })
        .click();
      await pickerModal.getByText(COLLECTION, { exact: true }).click();
      await expect(
        pickerModal.getByRole("button", { name: "Move", exact: true }),
      ).toBeEnabled();
    });

    test("moving collections should update the UI (metabase#14280, metabase#14482)", async ({
      page,
      mb,
    }) => {
      const NEW_COLLECTION = "New collection";

      // Create New collection within `Our analytics`
      await createCollection(mb.api, { name: NEW_COLLECTION, parent_id: null });

      // when a nested child collection is moved to the root (metabase#14482)
      await visitCollection(page, SECOND_COLLECTION_ID);

      await openCollectionMenu(page);
      const itemsLoaded = waitForCollectionItems(page, 3);
      await popover(page).getByText("Move", { exact: true }).click();

      const pickerModal = entityPickerModal(page);
      await expect(pickerModal.getByTestId("loading-indicator")).toHaveCount(0);
      await itemsLoaded;
      // make sure the first collection (current parent) is selected
      await expect(findPickerItem(page, "First collection")).toHaveAttribute(
        "data-active",
        "true",
      );
      // then click our analytics
      await pickerModal.getByText("Our analytics", { exact: true }).click();

      await pickerModal
        .getByRole("button", { name: "Move", exact: true })
        .click();
      await expect(entityPickerModal(page)).toHaveCount(0);
      // Cypress's cy.wait("@getTree") here is satisfied retroactively by an
      // earlier tree load (RTK doesn't refetch), so there's no new response to
      // await; the retrying sidebar assertions below settle it instead.

      await ensureCollectionHasNoChildren(page, "First collection");
      // Should be expanded automatically
      await ensureCollectionIsExpanded(page, "Second collection");
      // Move into the "Third collection"
      await navigationSidebar(page)
        .getByText("Third collection", { exact: true })
        .click();

      // should show the moved collection inside the folder tree (metabase#14280)
      await moveOpenedCollectionTo(page, NEW_COLLECTION);

      await ensureCollectionHasNoChildren(page, "Second collection");
      await ensureCollectionIsExpanded(page, NEW_COLLECTION, {
        children: ["Third collection"],
      });

      // the collection picker should show an error if we are unable to move a
      // collection (metabase#40700)
      await page.route(
        (url) => url.pathname === `/api/collection/${THIRD_COLLECTION_ID}`,
        async (route) => {
          if (route.request().method() !== "PUT") {
            return route.continue();
          }
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Ryan said no" }),
          });
        },
      );
      await openCollectionMenu(page);
      await popover(page).getByText("Move", { exact: true }).click();

      const errorModal = entityPickerModal(page);
      await entityPickerModalItem(page, 0, "Our analytics").click();
      await errorModal.getByRole("button", { name: "Move", exact: true }).click();
      // Entity picker should show an error message
      await expect(
        errorModal.getByText("Ryan said no", { exact: true }),
      ).toBeVisible();
    });

    test.describe("bulk actions", () => {
      test.describe("selection", () => {
        test("should be possible to apply bulk selection to all items (metabase#14705)", async ({
          page,
        }) => {
          await page.goto("/collection/root");

          // Pin one item
          await openUnpinnedItemMenu(page, "Orders, Count");
          await popover(page).getByText("Pin this", { exact: true }).click();
          await expect(
            getPinnedSection(page).getByText("18,760", { exact: true }),
          ).toBeVisible();

          // Select one
          await selectItemUsingCheckbox(page, "Orders");
          await expect(
            page.getByText("1 item selected", { exact: true }),
          ).toBeVisible();
          await assertSelectAllIsIndeterminate(page, true);
          await expect(getRowCheckbox(page, "Orders")).toBeChecked();

          // Select all
          await page
            .getByLabel("Select all items", { exact: true })
            .click();
          await assertSelectAllIsIndeterminate(page, false);
          await expect(
            page.getByTestId("toast-card").getByText(/\d+ items selected/),
          ).toBeVisible();

          // Deselect all
          await page
            .getByLabel("Select all items", { exact: true })
            .click();

          await expect(
            page.getByRole("checkbox", { checked: true }),
          ).toHaveCount(0);
          await expect(page.getByText(/item(s)? selected/)).toHaveCount(0);
        });

        test("should clean up selection when opening another collection (metabase#16491)", async ({
          page,
          mb,
        }) => {
          await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
            collection_id: ADMIN_PERSONAL_COLLECTION_ID,
          });
          await page.goto("/collection/root");
          await navigationSidebar(page)
            .getByText("Your personal collection", { exact: true })
            .click();

          await selectItemUsingCheckbox(page, "Orders");
          await expect(
            page.getByText("1 item selected", { exact: true }),
          ).toBeVisible();

          await navigationSidebar(page)
            .getByText("Our analytics", { exact: true })
            .click();
          await expect(page.getByText(/item(s)? selected/)).toHaveCount(0);
        });
      });

      test.describe("archive", () => {
        test("should be possible to bulk archive items (metabase#16496)", async ({
          page,
        }) => {
          await page.goto("/collection/root");
          await selectItemUsingCheckbox(page, "Orders");

          await page
            .getByTestId("toast-card")
            .locator("..")
            .getByRole("button", { name: "Move to trash", exact: true })
            .click();

          await expect(
            page.getByText("Orders", { exact: true }),
          ).toHaveCount(0);
          await expect(page.getByTestId("toast-card")).toHaveCount(0);
        });
      });

      test.describe("move", () => {
        test("should be possible to bulk move items and undo", async ({
          page,
        }) => {
          await page.goto("/collection/root");
          await selectItemUsingCheckbox(page, "Orders");

          await page
            .getByTestId("toast-card")
            .getByRole("button", { name: "Move", exact: true })
            .click();

          const pickerModal = entityPickerModal(page);
          await pickerModal
            .getByText("First collection", { exact: true })
            .click();
          await pickerModal
            .getByRole("button", { name: "Move", exact: true })
            .click();

          await expect(
            page.getByText("Orders", { exact: true }),
          ).toHaveCount(0);
          await expect(page.getByTestId("toast-card")).toHaveCount(0);

          // Check that items were actually moved
          await navigationSidebar(page)
            .getByText("First collection", { exact: true })
            .click();
          await expect(
            page.getByText("Orders", { exact: true }),
          ).toBeVisible();

          await page.getByText("Undo", { exact: true }).click();
          await navigationSidebar(page)
            .getByText("Our analytics", { exact: true })
            .click();
          await expect(
            page.getByText("Orders", { exact: true }),
          ).toBeVisible();
          await expect(page.getByText("Undo", { exact: true })).toHaveCount(0);
        });

        test("moving collections should disable moving into any of the moving collections", async ({
          page,
          mb,
        }) => {
          await createCollection(mb.api, { name: "Another collection" });

          // moving a single collection, from the collection header
          await page.goto(`/collection/${SECOND_COLLECTION_ID}`);

          await icon(page.getByTestId("collection-menu"), "ellipsis").click();
          await popover(page).getByText("Move", { exact: true }).click();

          const headerModal = entityPickerModal(page);
          // parent collection should be selected
          await expect(
            findPickerItem(page, "First collection"),
          ).toHaveAttribute("data-active", "true");
          // moving collection should be visible but disabled
          await expect(
            findPickerItem(page, "Second collection"),
          ).toHaveAttribute("data-disabled", /.*/);
          await headerModal.getByText("Cancel", { exact: true }).click();

          // from the collection items list
          await openEllipsisMenuFor(page, "Third collection", collectionTable(page));

          await popover(page).getByText("Move", { exact: true }).click();

          const listModal = entityPickerModal(page);
          // parent collection should be selected
          await expect(
            findPickerItem(page, "Second collection"),
          ).toHaveAttribute("data-active", "true");
          // moving collection should be visible but disabled
          await expect(
            findPickerItem(page, "Third collection"),
          ).toHaveAttribute("data-disabled", /.*/);
          await listModal.getByText("Cancel", { exact: true }).click();

          // bulk moving items that include collections
          await page.goto("/collection/root");

          const table = collectionTable(page);
          await selectItemUsingCheckbox(page, "Orders", table);
          await selectItemUsingCheckbox(page, "Another collection", table);
          await selectItemUsingCheckbox(page, "First collection", table);

          await page
            .getByTestId("toast-card")
            .getByRole("button", { name: "Move", exact: true })
            .click();

          // should disable all moving collections
          await expect(
            findPickerItem(page, "First collection"),
          ).toHaveAttribute("data-disabled", /.*/);
          await expect(
            findPickerItem(page, "Another collection"),
          ).toHaveAttribute("data-disabled", /.*/);
          await expect(
            findPickerItem(page, "Our analytics"),
          ).toHaveAttribute("data-active", "true");
        });

        test("moving collections should disable moving into any of the moving collections in recents or search (metabase#45248)", async ({
          page,
          mb,
        }) => {
          const outerCollection1 = await createCollection(mb.api, {
            name: "Outer collection 1",
          });
          const innerCollection1 = await createCollection(mb.api, {
            name: "Inner collection 1",
            parent_id: outerCollection1.id,
          });
          await createCollection(mb.api, {
            name: "Inner collection 2",
            parent_id: outerCollection1.id,
          });
          await createCollection(mb.api, { name: "Outer collection 2" });

          // mark the inner collection as recently selected
          await mb.api.post("/api/activity/recents", {
            context: "selection",
            model: "collection",
            model_id: innerCollection1.id,
          });

          await visitRootCollection(page);

          // single move
          await openCollectionItemMenu(page, "Outer collection 1");
          await popover(page).getByText("Move", { exact: true }).click();

          const singleModal = entityPickerModal(page);
          await expect(
            singleModal.getByText(/inner collection/),
          ).toHaveCount(0);
          await singleModal
            .getByRole("button", { name: "Cancel", exact: true })
            .click();

          // bulk move
          const table = collectionTable(page);
          await selectItemUsingCheckbox(page, "Orders", table);
          await selectItemUsingCheckbox(page, "Outer collection 1", table);

          await page
            .getByTestId("toast-card")
            .getByRole("button", { name: "Move", exact: true })
            .click();

          await expect(
            entityPickerModal(page).getByText(/inner collection/),
          ).toHaveCount(0);
        });
      });
    });

    test("collections list on the home page shouldn't depend on the name of the first 50 objects (metabase#16784)", async ({
      page,
      mb,
    }) => {
      // Create 50 dashboards named with `D`, which sorts before `F` (First
      // collection) — the home sidebar must still surface the collection.
      for (let i = 0; i < 50; i++) {
        await mb.api.createDashboard({ name: `Dashboard ${i}` });
      }

      await page.goto("/");
      await expect(
        navigationSidebar(page).getByText("First collection", { exact: true }),
      ).toBeVisible();
    });

    test("should create new collections within the current collection", async ({
      page,
    }) => {
      await visitCollection(page, THIRD_COLLECTION_ID);
      await navigationSidebar(page)
        .getByLabel("Create a new collection", { exact: true })
        .click();

      const newCollectionModal = page.getByTestId("new-collection-modal");
      await expect(
        newCollectionModal.getByText("Collection it's saved in", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        newCollectionModal
          .getByTestId("collection-picker-button")
          .getByText("Third collection", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("x-rays", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsNormalUser();
    });

    test("should allow to x-ray models from collection views", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
      await page.goto("/collection/root");

      await openEllipsisMenuFor(page, "Orders");
      const dashboardRequest = page.waitForResponse((response) =>
        /^\/api\/automagic-dashboards\/model\//.test(
          new URL(response.url()).pathname,
        ),
      );
      await popover(page).getByText("X-ray this", { exact: true }).click();
      await dashboardRequest;
    });
  });
});

test.describe("scenarios > collection items listing", () => {
  const TEST_QUESTION_QUERY = {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
    ],
  };

  const PAGE_SIZE = 25;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("pagination", () => {
    const SUBCOLLECTIONS = 1;
    const ADDED_QUESTIONS = 15;
    const ADDED_DASHBOARDS = 14;
    const TOTAL_ITEMS = SUBCOLLECTIONS + ADDED_DASHBOARDS + ADDED_QUESTIONS;

    test.beforeEach(async ({ mb }) => {
      // Removes the default questions and dashboards so the test doesn't depend
      // on the default database contents.
      await archiveAll(mb.api);

      for (let i = 0; i < ADDED_DASHBOARDS; i++) {
        await mb.api.createDashboard({ name: `dashboard ${i}` });
      }
      for (let i = 0; i < ADDED_QUESTIONS; i++) {
        await mb.api.createQuestion({
          name: `generated question ${i}`,
          query: TEST_QUESTION_QUERY,
        });
      }
    });

    test("should allow to navigate back and forth", async ({ page }) => {
      await visitRootCollection(page);

      // First page
      await expectPaginationRange(page, `1 - ${PAGE_SIZE}`);
      await expect(page.getByTestId("pagination-total")).toHaveText(
        String(TOTAL_ITEMS),
      );
      await expect(page.getByTestId("collection-entry")).toHaveCount(PAGE_SIZE);

      const secondPage = waitForCollectionItems(page, 1);
      await page.getByLabel("Next page", { exact: true }).click();
      await secondPage;

      // Second page
      await expectPaginationRange(page, `${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`);
      await expect(page.getByTestId("pagination-total")).toHaveText(
        String(TOTAL_ITEMS),
      );
      await expect(page.getByTestId("collection-entry")).toHaveCount(
        TOTAL_ITEMS - PAGE_SIZE,
      );
      await expect(
        page.getByLabel("Next page", { exact: true }),
      ).toBeDisabled();

      await page.getByLabel("Previous page", { exact: true }).click();

      // First page
      await expectPaginationRange(page, `1 - ${PAGE_SIZE}`);
      await expect(page.getByTestId("pagination-total")).toHaveText(
        String(TOTAL_ITEMS),
      );
      await expect(page.getByTestId("collection-entry")).toHaveCount(PAGE_SIZE);
    });
  });

  test.describe("sorting", () => {
    test.beforeEach(async ({ mb }) => {
      // Removes questions and dashboards from the default dataset, so it's
      // easier to test sorting.
      await archiveAll(mb.api);
    });

    test("should allow to sort unpinned items by columns asc and desc", async ({
      page,
      mb,
    }) => {
      for (const letter of ["A", "B", "C"]) {
        // collection_position: null (upstream) is the default (unpinned), so
        // it's omitted here — the api helper types don't accept it.
        await mb.api.createDashboard({ name: `${letter} Dashboard` });

        // Sign in as a different user so we have different "Last edited by"
        // names to test sorting by that column.
        await mb.signIn("normal");

        await mb.api.createQuestion({
          name: `${letter} Question`,
          query: TEST_QUESTION_QUERY,
        });
      }

      await visitRootCollection(page);
      // Wait for the loading spinner to disappear from the main sidebar,
      // otherwise the page re-renders and the test flakes.
      await expect(page.locator("circle")).toHaveCount(0);

      // sorted alphabetically by default
      await assertCollectionItemsOrder(page, "collection-entry-name", [
        "A Dashboard",
        "A Question",
        "B Dashboard",
        "B Question",
        "C Dashboard",
        "C Question",
        "First collection",
      ]);

      let itemsLoaded = waitForCollectionItems(page, 1);
      await toggleSortingFor(page, /Name/i);
      await itemsLoaded;

      // sorted alphabetically reversed
      await assertCollectionItemsOrder(page, "collection-entry-name", [
        "First collection",
        "C Question",
        "C Dashboard",
        "B Question",
        "B Dashboard",
        "A Question",
        "A Dashboard",
      ]);

      // Not sure why the same XHR doesn't happen after we click "Name" again
      await toggleSortingFor(page, /Name/i);
      // sorted alphabetically
      await assertCollectionItemsOrder(page, "collection-entry-name", [
        "A Dashboard",
        "A Question",
        "B Dashboard",
        "B Question",
        "C Dashboard",
        "C Question",
        "First collection",
      ]);

      itemsLoaded = waitForCollectionItems(page, 1);
      await toggleSortingFor(page, /Type/i);
      await itemsLoaded;

      // sorted dashboards first
      await assertCollectionItemsOrder(page, "collection-entry-name", [
        "A Dashboard",
        "B Dashboard",
        "C Dashboard",
        "A Question",
        "B Question",
        "C Question",
        "First collection",
      ]);

      itemsLoaded = waitForCollectionItems(page, 1);
      await toggleSortingFor(page, /Type/i);
      await itemsLoaded;

      // sorted collections first
      await assertCollectionItemsOrder(page, "collection-entry-name", [
        "First collection",
        "A Question",
        "B Question",
        "C Question",
        "A Dashboard",
        "B Dashboard",
        "C Dashboard",
      ]);

      itemsLoaded = waitForCollectionItems(page, 1);
      await toggleSortingFor(page, /Last edited by/i);
      await itemsLoaded;

      // sorted by last editor name alphabetically
      await assertCollectionItemsOrder(
        page,
        "collection-entry-last-edited-by",
        [
          "Bobby Tables",
          "Robert Tableton",
          "Robert Tableton",
          "Robert Tableton",
          "Robert Tableton",
          "Robert Tableton",
          "",
        ],
      );

      itemsLoaded = waitForCollectionItems(page, 1);
      await toggleSortingFor(page, /Last edited by/i);
      await itemsLoaded;

      // sorted by last editor name alphabetically reversed
      await assertCollectionItemsOrder(
        page,
        "collection-entry-last-edited-by",
        [
          "Robert Tableton",
          "Robert Tableton",
          "Robert Tableton",
          "Robert Tableton",
          "Robert Tableton",
          "Bobby Tables",
          "",
        ],
      );

      itemsLoaded = waitForCollectionItems(page, 1);
      await toggleSortingFor(page, /Last edited at/i);
      await itemsLoaded;

      // sorted newest last
      await assertCollectionItemsOrder(page, "collection-entry-name", [
        "A Dashboard",
        "A Question",
        "B Dashboard",
        "B Question",
        "C Dashboard",
        "C Question",
        "First collection",
      ]);

      itemsLoaded = waitForCollectionItems(page, 1);
      await toggleSortingFor(page, /Last edited at/i);
      await itemsLoaded;

      // sorted newest first
      await assertCollectionItemsOrder(page, "collection-entry-name", [
        "C Question",
        "C Dashboard",
        "B Question",
        "B Dashboard",
        "A Question",
        "A Dashboard",
        "First collection",
      ]);
    });

    test("should reset pagination if sorting applied on not first page", async ({
      page,
      mb,
    }) => {
      for (let i = 0; i < 15; i++) {
        await mb.api.createDashboard({ name: `dashboard ${i}` });
      }
      for (let i = 0; i < 15; i++) {
        await mb.api.createQuestion({
          name: `generated question ${i}`,
          query: TEST_QUESTION_QUERY,
        });
      }

      await visitRootCollection(page);

      await expectPaginationRange(page, `1 - ${PAGE_SIZE}`);

      const secondPage = waitForCollectionItems(page, 1);
      await page.getByLabel("Next page", { exact: true }).click();
      await secondPage;

      const resorted = waitForCollectionItems(page, 1);
      await toggleSortingFor(page, /Last edited at/i);
      await resorted;

      await expectPaginationRange(page, `1 - ${PAGE_SIZE}`);
    });
  });
});

test.describe("scenarios > collections > entity id support", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("/collection/entity/${entity_id} should redirect to /collection/${id}", async ({
    page,
  }) => {
    await page.goto(`/collection/entity/${FIRST_COLLECTION_ENTITY_ID}`);
    await expect(page).toHaveURL(
      new RegExp(`/collection/${FIRST_COLLECTION_ID}`),
    );

    // Making sure the collection loads
    await expect(
      main(page).getByText("First collection", { exact: true }),
    ).toBeVisible();
  });

  test("/collection/entity/${entity_id}/move should redirect to /collection/${id}/move", async ({
    page,
  }) => {
    await page.goto(`/collection/entity/${FIRST_COLLECTION_ENTITY_ID}/move`);
    await expect(page).toHaveURL(
      new RegExp(`/collection/${FIRST_COLLECTION_ID}/move`),
    );

    await expect(
      main(page).getByText("First collection", { exact: true }),
    ).toBeVisible();
    await expect(
      modal(page).getByText('Move "First collection"?', { exact: true }),
    ).toBeVisible();
  });
});
