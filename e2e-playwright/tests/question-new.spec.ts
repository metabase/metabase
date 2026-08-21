/**
 * Playwright port of e2e/test/scenarios/question/new.cy.spec.js
 *
 * Porting notes:
 * - The cy.spy()-based search-request counter becomes a page.on("request")
 *   listener; the calledOnce assertion becomes an array-length check.
 * - The `@dataset` alias registered inside H.openOrdersTable's
 *   visitQuestionAdhoc becomes waitForDataset promises registered before
 *   each cell click.
 * - In the "creating a new dashboard" tests, the POST /api/dashboard fires
 *   when the "Create" dialog button is clicked, not when "Select" is —
 *   cy.wait("@createDashboard") after Select passes only because cy.wait
 *   consumes already-received responses. The waits here are registered at
 *   the true trigger (the Create click).
 * - Cypress `H.tableInteractiveBody().get(...)` silently escapes its scoping
 *   (chained cy.get() queries from the document root); the port scopes the
 *   cell queries to the table body for real.
 * - The `@prerelease` and `@OSS` tags have no Playwright equivalent; those
 *   tests run unconditionally.
 * - cy.signIn("nocollection") becomes signInWithCachedSession (cookie
 *   injection) — the test only drives the UI as that user, so mb.api not
 *   tracking the session is fine.
 */
import type { Page } from "@playwright/test";

import { pickEntity, modal } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { miniPickerBrowseAll } from "../support/joins";
import { tableInteractive } from "../support/models";
import {
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { waitForDataset } from "../support/nested-questions";
import {
  entityPickerModal,
  entityPickerModalLevel,
  miniPicker,
  notebookButton,
  openNotebook,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import {
  signInWithCachedSession,
  visitQuestionAdhoc,
} from "../support/permissions";
import {
  NOCOLLECTION_PERSONAL_COLLECTION_NAME,
  SECOND_COLLECTION_ID,
  addSQLiteDatabase,
  checkSavedToCollectionQuestionToast,
  collectionOnTheGoModal,
  entityPickerModalItem,
  logRecent,
  miniPickerHeader,
  selectPermissionRow,
  tableInteractiveBody,
  visitCollection,
  waitForCreateDashboard,
  waitForCreateQuestion,
} from "../support/question-new";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
  THIRD_COLLECTION_ID,
} from "../support/sample-data";
import { createCollection } from "../support/search";
import { saveQuestion } from "../support/sharing";
import {
  appBar,
  popover,
  queryBuilderHeader,
  visitDashboard,
} from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// test various entry points into the query builder

test.describe("scenarios > question > new", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("data picker", () => {
    test("data selector popover should not be too small (metabase#15591)", async ({
      page,
      mb,
    }) => {
      // Add 10 more databases
      for (let i = 0; i < 10; i++) {
        await addSQLiteDatabase(mb.api, { name: "Sample" + i });
      }

      await page.goto("/");
      await startNewQuestion(page);
      await expect(
        miniPicker(page).getByText("Sample3", { exact: true }),
      ).toBeVisible();
    });

    test("new question data picker search should work for both saved questions and database tables", async ({
      page,
    }) => {
      // Port of cy.intercept("GET", "/api/search?q=*", cy.spy().as("searchQuery")).
      const searchQueries: string[] = [];
      page.on("request", (request) => {
        if (request.method() !== "GET") {
          return;
        }
        const url = new URL(request.url());
        if (url.pathname === "/api/search" && url.searchParams.has("q")) {
          searchQueries.push(url.search);
        }
      });

      await page.goto("/");
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();

      const picker = entityPickerModal(page);
      await expect(
        entityPickerModalLevel(page, 0).getByText(/Search results for /),
      ).toHaveCount(0);
      await entityPickerModalItem(page, 0, "Our analytics").click();

      const searchInput = picker.getByPlaceholder("Search…");
      await searchInput.pressSequentially("  ");
      await searchInput.blur();
      const search = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === "/api/search" &&
          url.searchParams.has("q")
        );
      });
      await searchInput.pressSequentially("ord");
      await search;
      // should not trigger search for an empty string
      expect(searchQueries).toHaveLength(1);

      await expect(
        entityPickerModalLevel(page, 0).getByText(/Search results for /),
      ).toBeVisible();

      for (const text of [
        "Orders, Count", //question
        "Orders Model", //model
        "Orders", //table
      ]) {
        // Cypress: findAllByText(text).should("have.length.at.least", 1)
        await expect(picker.getByText(text, { exact: true }).first()).toBeVisible();
      }

      // Discarding the search query should take us back to the original tab
      await searchInput.clear();
      await searchInput.blur();
      await expect(
        picker.locator("[role='tab']").filter({ hasText: /Search/ }),
      ).toHaveCount(0);

      await picker.getByText("Orders, Count", { exact: true }).click();

      // toggle notebook button should be hidden for brand new questions
      await expect(notebookButton(page)).toHaveCount(0);

      await visualize(page);
      await expect(page.getByText("18,760", { exact: true })).toBeVisible();
      // should reopen saved question picker after returning back to editor mode
      await openNotebook(page);

      await expect(notebookButton(page)).toBeVisible();

      await page
        .getByTestId("data-step-cell")
        .getByText(/Orders, Count/)
        .click();
      await miniPickerHeader(page).click();
      await miniPickerBrowseAll(page).click();

      // It is now possible to choose another saved question
      await expect(
        entityPickerModalItem(page, 0, "Our analytics"),
      ).toHaveAttribute("data-active", "true");
      await expect(picker.getByText("Orders", { exact: true })).toBeAttached();
      await expect(
        picker.getByText("Orders, Count", { exact: true }),
      ).toBeAttached();

      await pickEntity(page, {
        path: ["Databases", "Sample Database", "Products"],
      });

      await expect(
        page.getByTestId("data-step-cell").getByText(/Products/),
      ).toBeVisible();
      await visualize(page);
      await expect(
        page.getByText("Rustic Paper Wallet", { exact: true }),
      ).toBeVisible();
    });

    test("should suggest questions saved in collections with colon in their name (metabase#14287)", async ({
      page,
      mb,
    }) => {
      const { id: collectionId } = await createCollection(mb.api, {
        name: "foo:bar",
        parent_id: null,
      });
      // Move question #1 ("Orders") to newly created collection
      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: collectionId,
      });
      // Sanity check: make sure Orders is indeed inside new collection
      await page.goto(`/collection/${collectionId}`);
      await expect(page.getByText("Orders", { exact: true })).toBeVisible();

      await startNewQuestion(page);
      const picker = miniPicker(page);
      await picker.getByText("Our analytics", { exact: true }).click();
      // Note: collection name's first letter is capitalized
      await picker.getByText(/foo:bar/i).click();
      await expect(picker.getByText("Orders", { exact: true })).toBeVisible();
    });

    test("'Saved Questions' prompt should respect nested collections structure (metabase#14178)", async ({
      page,
      mb,
    }) => {
      // Move first question in a DB snapshot ("Orders") to a "Second collection"
      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: SECOND_COLLECTION_ID,
      });

      await page.goto("/");
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();

      const picker = entityPickerModal(page);
      await entityPickerModalItem(page, 0, "Our analytics").click();
      await expect(
        picker.getByText("First collection", { exact: true }),
      ).toBeAttached();
      await expect(
        picker.getByText("Second collection", { exact: true }),
      ).toHaveCount(0);
      await expect(
        picker.getByText("Third collection", { exact: true }),
      ).toHaveCount(0);

      await picker.getByText("First collection", { exact: true }).click();
      await assertDataPickerEntitySelected(page, 0, "Our analytics");
      await assertDataPickerEntitySelected(page, 1, "First collection");
      await expect(
        picker.getByText("Second collection", { exact: true }),
      ).toBeAttached();
      await expect(
        picker.getByText("Third collection", { exact: true }),
      ).toHaveCount(0);

      await picker.getByText("Second collection", { exact: true }).click();
      await assertDataPickerEntitySelected(page, 0, "Our analytics");
      await assertDataPickerEntitySelected(page, 1, "First collection");
      await assertDataPickerEntitySelected(page, 2, "Second collection");
      await expect(
        picker.getByText("Third collection", { exact: true }),
      ).toHaveCount(0);
    });

    test("should be possible to create a question based on a question in another user personal collection", async ({
      page,
      mb,
      context,
    }) => {
      await mb.signOut();
      await signInWithCachedSession(context, "nocollection");
      await page.goto("/");
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();
      await pickEntity(page, {
        path: ["Databases", "Sample Database", "Orders"],
      });
      await visualize(page);
      await saveQuestion(page, "Personal question");

      await mb.signOut();
      await mb.signInAsAdmin();
      await page.goto("/");
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();

      const picker = entityPickerModal(page);
      await entityPickerModalItem(page, 0, "Our analytics").click();
      await picker
        .getByText("All personal collections", { exact: true })
        .click();
      await picker
        .getByText(NOCOLLECTION_PERSONAL_COLLECTION_NAME, { exact: true })
        .click();
      await picker.getByText("Personal question", { exact: true }).click();
      await visualize(page);
    });
  });

  test("composite keys should act as filters on click (metabase#13717)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/field/${ORDERS.QUANTITY}`, {
      semantic_type: "type/PK",
    });

    // Port of H.openOrdersTable().
    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: { "source-table": ORDERS_ID },
        database: SAMPLE_DB_ID,
      },
    });

    // Quantity (last in the default order for Sample Database);
    // first table body cell should show the quantity for order ID#1
    const lastColumnCells = page.locator(
      ".test-TableInteractive-cellWrapper--lastColumn",
    );
    await expect(lastColumnCells.nth(0)).toContainText("2");

    const quantityFilterQuery = waitForDataset(page);
    await lastColumnCells.nth(0).click();
    await quantityFilterQuery;

    const firstColumnCells = tableInteractiveBody(page).locator(
      ".test-TableInteractive-cellWrapper--firstColumn",
    );
    await expect
      .poll(() => firstColumnCells.count(), {
        message: "expected more than one row after filtering by quantity",
      })
      .toBeGreaterThan(1);

    // **Reported at v0.34.3 - v0.37.0.2 / probably was always like this**
    // **It should display the table with all orders with the selected quantity.**
    await expect(tableInteractive(page)).toBeVisible();

    // ID (first in the default order for Sample Database)
    await expect(firstColumnCells.nth(0)).toContainText("1");
    const idFilterQuery = waitForDataset(page);
    await firstColumnCells.nth(0).click();
    await idFilterQuery;

    // only one row should appear after filtering by ID
    await expect(firstColumnCells).toHaveCount(1);
  });

  test("should handle ad-hoc question with old syntax (metabase#15372)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["=", ["field-id", ORDERS.USER_ID], 1],
        },
        database: SAMPLE_DB_ID,
      },
    });

    await expect(page.getByText("User ID is 1", { exact: true })).toBeVisible();
    await expect(page.getByText("37.65", { exact: true })).toBeVisible();
  });

  test("should suggest the currently viewed dashboard when saving question", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await appBar(page).getByText("New", { exact: true }).click();
    await popover(page).getByText("Question", { exact: true }).click();

    await miniPickerBrowseAll(page).click();
    await pickEntity(page, { path: ["Databases", "Sample Database", "Orders"] });

    // The selected table should be saved and show in recents (metabase#45003)

    await page.getByRole("button", { name: /Orders/ }).click();
    await miniPickerHeader(page).click();
    await miniPickerBrowseAll(page).click();
    await entityPickerModalItem(page, 0, "Recent items").click();

    const startingDataDialog = page.getByRole("dialog", {
      name: "Pick your starting data",
      exact: true,
    });
    await expect(
      startingDataDialog.getByText("Orders", { exact: true }),
    ).toBeAttached();
    await startingDataDialog.getByRole("button", { name: /Close/ }).click();

    await queryBuilderHeader(page).getByText("Save", { exact: true }).click();
    await expect(
      page
        .getByTestId("save-question-modal")
        .getByLabel(/Where do you want to save/),
    ).toHaveText("Orders in a dashboard");
  });

  test("should not suggest recent items where can_write=false when saving a question", async ({
    page,
    mb,
  }) => {
    // SETUP TEST - prevent normal user from having access to third collection w/ added content

    // create dashboard that will have restricted access
    const dashboardResponse = await mb.api.post("/api/dashboard", {
      name: "Third collection dashboard",
      collection_id: THIRD_COLLECTION_ID,
    });
    const { id: restrictedDashboardId } = (await dashboardResponse.json()) as {
      id: number;
    };

    // restrict access to a collection
    await page.goto(`/admin/permissions/collections/${THIRD_COLLECTION_ID}`);
    await selectPermissionRow(page, "collection", 0);
    await popover(page).getByText("View", { exact: true }).click();

    const saveGraph = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === "/api/collection/graph",
    );
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    const confirmModal = modal(page);
    await expect(confirmModal.getByText("Save permissions?")).toBeVisible();
    await confirmModal.getByRole("button", { name: "Yes", exact: true }).click();
    await saveGraph;

    // TEST STARTS HERE - start testing proper enforcement
    await mb.signIn("normal");
    await page.goto("/");

    // log recent views to items with can_write access
    await logRecent(mb.api, "collection", SECOND_COLLECTION_ID); // report recent interaction for collection w/ write access
    await logRecent(mb.api, "collection", THIRD_COLLECTION_ID); // report recent interaction for collection w/o write access
    await logRecent(mb.api, "dashboard", ORDERS_DASHBOARD_ID); // report recent interaction for dashboard w/ write access
    await logRecent(mb.api, "dashboard", restrictedDashboardId); // report recent interaction for dashboard w/o write access

    // test recent items do not exist
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select 'hi'");
    await page
      .getByTestId("native-query-editor-container")
      .getByRole("button", { name: "Get Answer", exact: true })
      .click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await page
      .getByTestId("save-question-modal")
      .getByLabel(/Where do you want to save this/)
      .click();

    await entityPickerModalItem(page, 0, "Recent items").click();
    // test valid recents appear
    await expect(
      entityPickerModalItem(page, 1, "Second collection"),
    ).toBeAttached();
    await expect(
      entityPickerModalItem(page, 1, "Orders in a dashboard"),
    ).toBeAttached();

    // test invalid recents do not appear
    const picker = entityPickerModal(page);
    await expect(
      picker.getByText("Third collection", { exact: true }),
    ).toHaveCount(0);
    await expect(
      picker.getByText("Third collection dashboard", { exact: true }),
    ).toHaveCount(0);
  });

  // Cypress tag: @prerelease — no Playwright equivalent, runs unconditionally.
  test("should be able to save a question to a collection created on the go", async ({
    page,
  }) => {
    await visitCollection(page, THIRD_COLLECTION_ID);

    await appBar(page).getByText("New", { exact: true }).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await miniPickerBrowseAll(page).click();
    await pickEntity(page, { path: ["Our analytics", "Orders"] });
    await queryBuilderHeader(page).getByText("Save", { exact: true }).click();

    // should be able to tab through fields (metabase#41683)
    // Since the submit button has initial focus on this modal, we need an extra tab to get past the modal close button
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Description", { exact: true })).toBeFocused();

    await page
      .getByTestId("save-question-modal")
      .getByLabel(/Where do you want to save/)
      .click();

    await entityPickerModal(page)
      .getByText("New collection", { exact: true })
      .click();

    const NEW_COLLECTION = "Foo";
    const onTheGoModal = collectionOnTheGoModal(page);
    await onTheGoModal.getByLabel(/Give it a name/).fill(NEW_COLLECTION);
    await onTheGoModal.getByText("Create", { exact: true }).click();

    const picker = entityPickerModal(page);
    await picker.getByText("Foo", { exact: true }).click();
    await picker.getByRole("button", { name: /Select/ }).click();

    const saveModal = page.getByTestId("save-question-modal");
    await expect(
      saveModal.getByText("Save new question", { exact: true }),
    ).toBeVisible();
    await expect(
      saveModal.getByLabel(/Where do you want to save/),
    ).toHaveText(NEW_COLLECTION);
    await saveModal.getByText("Save", { exact: true }).click();

    await expect(
      page.locator("header").getByText(NEW_COLLECTION, { exact: true }),
    ).toBeVisible();
  });

  test.describe("add to a dashboard", () => {
    const collectionInRoot = {
      name: "Collection in root collection",
    };
    const dashboardInRoot = {
      name: "Dashboard in root collection",
    };
    const myPersonalCollectionName = "Bobby Tables's Personal Collection";

    test.beforeEach(async ({ page, mb }) => {
      const { id } = await createCollection(mb.api, collectionInRoot);
      await mb.api.post("/api/dashboard", {
        name: "Extra Dashboard",
        collection_id: id,
      });
      await mb.api.createDashboard(dashboardInRoot);
      // The Cypress spec avoids H.startNewQuestion because that helper visits
      // a URL-hash card missing `display: "table"`; the Playwright
      // startNewQuestion is UI-driven (New > Question), which is exactly the
      // flow this beforeEach performs by hand — so use it.
      await page.goto("/");
      await startNewQuestion(page);
    });

    test("should hide public collections when selecting a dashboard for a question in a personal collection", async ({
      page,
    }) => {
      const dataPicker = miniPicker(page);
      await dataPicker.getByText("Sample Database", { exact: true }).click();
      await dataPicker.getByText("Orders", { exact: true }).click();

      await queryBuilderHeader(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await page
        .getByTestId("save-question-modal")
        .getByLabel(/Where do you want to save/)
        .click();

      await pickEntity(page, {
        path: [myPersonalCollectionName],
        select: true,
      });

      const createQuestion = waitForCreateQuestion(page);
      await page
        .getByTestId("save-question-modal")
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await createQuestion;

      await expect(page.getByTestId("save-question-modal")).toHaveCount(0);

      await checkSavedToCollectionQuestionToast(page, true);

      const picker = entityPickerModal(page);
      await expect(
        picker.getByText("Add this question to a dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        picker.getByText(/bobby tables's personal collection/i),
      ).toBeVisible();
      await expect(picker.getByText(/our analytics/i)).toHaveCount(0);
    });

    test("should show all collections when selecting a dashboard for a question in a public collection", async ({
      page,
    }) => {
      const dataPicker = miniPicker(page);
      await dataPicker.getByText("Sample Database", { exact: true }).click();
      await dataPicker.getByText("Orders", { exact: true }).click();

      await queryBuilderHeader(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await page
        .getByTestId("save-question-modal")
        .getByLabel(/Where do you want to save/)
        .click();

      await pickEntity(page, {
        path: ["Our analytics"],
        select: true,
      });

      const createQuestion = waitForCreateQuestion(page);
      await page
        .getByTestId("save-question-modal")
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await createQuestion;

      await checkSavedToCollectionQuestionToast(page, true);

      const picker = entityPickerModal(page);
      await expect(
        picker.getByText("Add this question to a dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        picker.getByText("Bobby Tables's Personal Collection", { exact: true }),
      ).toBeVisible();
      await expect(
        picker.getByText(collectionInRoot.name, { exact: true }),
      ).toBeVisible();
      await expect(
        picker.getByText(dashboardInRoot.name, { exact: true }),
      ).toBeVisible();
      await expect(
        picker.getByText("New dashboard", { exact: true }),
      ).toBeVisible();
    });

    test.describe("creating a new dashboard", () => {
      test.beforeEach(async ({ page }) => {
        const dataPicker = miniPicker(page);
        await dataPicker.getByText("Sample Database", { exact: true }).click();
        await dataPicker.getByText("Orders", { exact: true }).click();

        await queryBuilderHeader(page)
          .getByRole("button", { name: "Save", exact: true })
          .click();

        await page
          .getByTestId("save-question-modal")
          .getByLabel(/Where do you want to save/)
          .click();

        await pickEntity(page, {
          path: ["Our analytics"],
          select: true,
        });

        const createQuestion = waitForCreateQuestion(page);
        await page
          .getByTestId("save-question-modal")
          .getByText("Save", { exact: true })
          .click();
        await createQuestion;

        await checkSavedToCollectionQuestionToast(page, true);
      });

      test("when selecting a collection", async ({ page }) => {
        await pickEntity(page, {
          path: ["Our analytics", "Collection in root collection"],
        });
        await entityPickerModal(page)
          .getByRole("button", { name: /New dashboard/ })
          .click();

        const createDialog = page.getByRole("dialog", {
          name: "Create a new dashboard",
          exact: true,
        });
        const createDashboard = waitForCreateDashboard(page);
        await createDialog.getByRole("textbox").fill("New Dashboard");
        await createDialog
          .getByRole("button", { name: "Create", exact: true })
          .click();
        const { id } = (await (await createDashboard).json()) as { id: number };

        await expect(
          entityPickerModalItem(page, 1, "Collection in root collection"),
        ).toHaveAttribute("data-active", "true");
        await expect(
          entityPickerModalItem(page, 2, "New Dashboard"),
        ).toHaveAttribute("data-active", "true");

        await entityPickerModal(page)
          .getByRole("button", { name: /Select/ })
          .click();
        await expect(page).toHaveURL(
          new RegExp(`/dashboard/${id}-new-dashboard$`),
        );
      });

      test("when selecting a collection with no child dashboards (metabase#47000)", async ({
        page,
      }) => {
        await pickEntity(page, {
          path: ["Our analytics", "First collection"],
        });
        await entityPickerModal(page)
          .getByRole("button", { name: /New dashboard/ })
          .click();

        const createDialog = page.getByRole("dialog", {
          name: "Create a new dashboard",
          exact: true,
        });
        const createDashboard = waitForCreateDashboard(page);
        await createDialog.getByRole("textbox").fill("New Dashboard");
        await createDialog
          .getByRole("button", { name: "Create", exact: true })
          .click();
        const { id } = (await (await createDashboard).json()) as { id: number };

        await expect(
          entityPickerModalItem(page, 1, "First collection"),
        ).toHaveAttribute("data-active", "true");
        await expect(
          entityPickerModalItem(page, 2, "New Dashboard"),
        ).toHaveAttribute("data-active", "true");

        await entityPickerModal(page)
          .getByRole("button", { name: /Select/ })
          .click();
        await expect(page).toHaveURL(
          new RegExp(`/dashboard/${id}-new-dashboard$`),
        );
      });

      test("when a dashboard is currently selected", async ({ page }) => {
        await pickEntity(page, {
          path: ["Our analytics", "Orders in a dashboard"],
        });
        await entityPickerModal(page)
          .getByRole("button", { name: /New dashboard/ })
          .click();

        const createDialog = page.getByRole("dialog", {
          name: "Create a new dashboard",
          exact: true,
        });
        const createDashboard = waitForCreateDashboard(page);
        await createDialog.getByRole("textbox").fill("New Dashboard");
        await createDialog
          .getByRole("button", { name: "Create", exact: true })
          .click();
        const { id } = (await (await createDashboard).json()) as { id: number };

        await expect(
          entityPickerModalItem(page, 1, "New Dashboard"),
        ).toHaveAttribute("data-active", "true");

        await entityPickerModal(page)
          .getByRole("button", { name: /Select/ })
          .click();
        await expect(page).toHaveURL(
          new RegExp(`/dashboard/${id}-new-dashboard$`),
        );
      });
    });
  });
});

// the data picker has different behavior if there are no models in the instance
// the default instance image has a model in it, so we need to separately test the
// model-less behavior
//
// Cypress tags: @OSS, @prerelease — no Playwright equivalent, runs against
// whatever backend the suite targets.
test.describe("scenarios > question > new > data picker > without models", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore("without-models");
    await mb.signInAsAdmin();
  });

  test("can create a question from the sample database", async ({ page }) => {
    await page.goto("/question/new");

    await miniPickerBrowseAll(page).click();
    await pickEntity(page, {
      path: ["Databases", "Sample Database", "Products"],
    });

    // strange: we get different behavior when we go to question/new
    await page.getByTestId("run-button").first().click();

    await expect(
      tableInteractive(page).getByText("Rustic Paper Wallet", { exact: true }),
    ).toBeVisible();
  });

  test("can create a question from a saved question", async ({ page }) => {
    await page.goto("/question/new");

    await miniPickerBrowseAll(page).click();
    await pickEntity(page, { path: ["Our analytics", "Orders"] });

    // strange: we get different behavior when we go to question/new
    await page.getByTestId("run-button").first().click();

    await expect(
      tableInteractive(page).getByText("39.72", { exact: true }),
    ).toBeVisible();
  });

  test("shows models and raw data options after creating a model", async ({
    page,
    mb,
  }) => {
    await mb.api.createQuestion({
      name: "Orders Model",
      query: { "source-table": ORDERS_ID },
      type: "model",
    });

    const recents = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/activity/recents",
    );

    await page.goto("/question/notebook");

    await miniPickerBrowseAll(page).click();
    await pickEntity(page, { path: ["Our analytics", "Orders Model"] });

    await recents;

    await page.getByRole("button", { name: /Orders Model/ }).click();
    await miniPickerHeader(page).click();

    await miniPickerBrowseAll(page).click();
    const picker = entityPickerModal(page);
    await picker.getByText("Recent items", { exact: true }).click();
    const resultItem = picker.getByTestId("result-item");
    await expect(resultItem).toHaveCount(1);
    await expect(resultItem).toContainText("Orders Model");
  });
});

async function assertDataPickerEntitySelected(
  page: Page,
  level: number,
  name: string,
) {
  await expect(entityPickerModalItem(page, level, name)).toHaveAttribute(
    "data-active",
    "true",
  );
}
