/**
 * Port of e2e/test/scenarios/organization/entity-picker.cy.spec.ts
 *
 * The entity picker across every flow that opens one: the data picker (tables +
 * cards), the question picker (dashcard "Select question"), the collection
 * picker (move / save-into), the dashboard picker (add-to-dashboard), plus the
 * modal-stack / layout / search-path behaviours in "misc entity picker stuff".
 *
 * Port notes
 * ----------
 * - **QA-DATABASE TIER.** Three tests carry `@external` upstream (multi-database
 *   / multi-schema Writable Postgres12 and schema-less QA MySQL8) and are gated
 *   on the deliberate `PW_QA_DB_ENABLED` (bare `QA_DB_ENABLED` leaks truthy from
 *   cypress.env.json). Everything else runs on the plain `default` snapshot.
 * - **Search input**: never Enter. `SearchInput` debounces onChange 300ms and
 *   Enter submits the enclosing form, unmounting the picker before the debounce
 *   fires. `enterSearchText` (support/entity-picker.ts) registers the
 *   `/api/search` wait, clicks (cy.type clicks first), types, awaits.
 * - **Tree clicks are paced.** `pickEntity`/`clickPickerItem` re-click in a
 *   `toPass` loop gated on the row's own `data-active`, because the column
 *   re-renders under a resolved locator while children load.
 * - **Search results are virtualized**, so upstream's `should("exist")` only
 *   ever means "rendered" — the port keeps that (`toBeAttached`), and upstream's
 *   own comment about "Normal personal collection 2" being just off-screen is
 *   the same observation.
 * - **A vacuous upstream assertion is preserved, not fixed**: the collection
 *   picker's inaccessible-root test asserts `notFoundItems: ["First Collection"]`
 *   with a capital C, which an exact `findByText` can never match against the
 *   real "First collection". Ported literally; recorded in findings-inbox.
 * - `cy.realPress("Escape")` → `parkMouseAwayFromTooltips` + `keyboard.press`
 *   (a parked real cursor opens a tooltip that eats the first Escape).
 * - `H.resyncDatabase({dbId})` is called with an explicit `tables` list — the
 *   bare form gates on nothing (PORTING).
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import {
  ORDERS_QUESTION_ID,
  FIRST_COLLECTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { ORDERS_COUNT_QUESTION_ID } from "../support/organization";
import {
  modal,
  newButton,
  popover,
  visitDashboard,
  visitQuestion,
  openNavigationSidebar,
} from "../support/ui";
import { getNotebookStep, startNewQuestion, visualize } from "../support/notebook";
import { miniPickerBrowseAll } from "../support/joins";
import { openQuestionActions } from "../support/models";
import { openTable } from "../support/ad-hoc-question";
import { editDashboard, getDashboardCard } from "../support/dashboard";
import { startNewCollectionFromSidebar } from "../support/command-palette";
import { undoToast } from "../support/metrics";
import { parkMouseAwayFromTooltips } from "../support/documents";
import { updateCollectionGraph } from "../support/click-behavior";
import { cachedUserName } from "../support/dashboard-core";
import { resyncDatabase } from "../support/schema-viewer";
import { resetTestTableMultiSchema } from "../support/data-model";
import { createDashboard } from "../support/factories";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ALL_USERS_GROUP,
  WRITABLE_DB_ID,
  assertNoSearchScopeSelectorYet,
  assertSearchResults,
  clickPickerItem,
  enterSearchTextDeferred,
  collectionOnTheGoModal,
  createTestCards,
  createTestCollections,
  createTestDashboardWithEmptyCard,
  createTestDashboards,
  dashboardOnTheGoModal,
  enterSearchText,
  entityPickerModal,
  entityPickerModalItem,
  entityPickerModalLevel,
  globalSearchTab,
  localSearchTab,
  pickEntity,
  selectGlobalSearchTab,
  selectLocalSearchTab,
  testCardSearchForAllPersonalCollections,
  testCardSearchForInaccessibleRootCollection,
  testCardSearchForNormalUser,
  waitForSearchable,
} from "../support/entity-picker";
import type { MetabaseApi } from "../support/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const QA_DB_SKIP_REASON =
  "Requires the writable QA Postgres / QA MySQL8 containers and their snapshots (set PW_QA_DB_ENABLED)";

/** Port of the spec-local closeAndAssertModal. */
async function closeAndAssertModal(page: Page, getModal: () => Locator) {
  await expect(getModal()).toHaveCount(1);
  // cy.realPress("Escape") — but a parked real cursor can open a tooltip whose
  // floating-ui useDismiss swallows the first Escape.
  await parkMouseAwayFromTooltips(page);
  await page.keyboard.press("Escape");
  await expect(getModal()).toHaveCount(0);
}

/** Port of the spec-local selectQuestionFromDashboard. */
async function selectQuestionFromDashboard(
  page: Page,
  api: MetabaseApi,
  dashboardDetails: Record<string, unknown> = {},
) {
  const dashboard = await createTestDashboardWithEmptyCard(
    api,
    dashboardDetails,
  );
  await visitDashboard(page, api, dashboard.id);
  await editDashboard(page);
  await getDashboardCard(page)
    .getByRole("button", { name: "Select question", exact: true })
    .click();
}

test.describe("scenarios > organization > entity picker", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("data picker", () => {
    test.describe("tables", () => {
      test("should select a table from local search results", async ({
        page,
      }) => {
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await clickPickerItem(page, 0, "Databases");
        await enterSearchText(page, { text: "prod", placeholder: "Search…" });
        await expect(localSearchTab(page, "Databases")).toBeChecked();
        await assertSearchResults(page, { foundItems: ["Products"] });
        await entityPickerModal(page)
          .getByText("Products", { exact: true })
          .click();

        await expect(
          getNotebookStep(page, "data").getByText("Products", { exact: true }),
        ).toBeVisible();
      });

      test("should select a table from global search results", async ({
        page,
      }) => {
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await clickPickerItem(page, 0, "Databases");
        await enterSearchText(page, { text: "prod", placeholder: "Search…" });
        await selectGlobalSearchTab(page);
        await assertSearchResults(page, {
          foundItems: ["Products"],
          totalFoundItemsCount: 3,
        });
        await entityPickerModal(page)
          .getByText("Products", { exact: true })
          .click();

        await expect(
          getNotebookStep(page, "data").getByText("Products", { exact: true }),
        ).toBeVisible();
      });

      test("should search by table display names and not real names", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        await mb.api.put(`/api/table/${ORDERS_ID}`, { display_name: "Events" });
        // The rename has to reach the search index before either half of this
        // test means anything — the first block would otherwise still find
        // "Orders" and the second would find no "Events". Upstream relied on
        // Cypress's UI-flow latency.
        await waitForSearchable(mb.api, "Events");
        await mb.signInAsNormalUser();
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();

        // real table name should give no results
        await clickPickerItem(page, 0, "Databases");
        await enterSearchText(page, { text: "Orders", placeholder: "Search…" });
        await expect(localSearchTab(page, "Databases")).toBeChecked();
        await assertSearchResults(page, { notFoundItems: ["Orders"] });

        // display table name should be used to search for a table
        await enterSearchText(page, { text: "Events", placeholder: "Search…" });
        await expect(localSearchTab(page, "Databases")).toBeChecked();
        await assertSearchResults(page, {
          foundItems: ["Events"],
          notFoundItems: ["Orders"],
          totalFoundItemsCount: 1,
        });
        await entityPickerModal(page)
          .getByText("Events", { exact: true })
          .click();

        await expect(
          getNotebookStep(page, "data").getByText("Events", { exact: true }),
        ).toBeVisible();
      });

      test("should search for tables when there are multiple databases", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
        await mb.restore("postgres-writable");
        await resetTestTableMultiSchema();
        await mb.signInAsAdmin();
        // Explicit `tables` — the bare {dbId} form gates on nothing.
        await resyncDatabase(mb.api, {
          dbId: WRITABLE_DB_ID,
          tables: ["Animals", "Birds"],
        });

        // first database
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await clickPickerItem(page, 0, "Databases");
        await enterSearchText(page, { text: "prod", placeholder: "Search…" });
        await expect(localSearchTab(page, "Databases")).toBeChecked();
        await assertSearchResults(page, { foundItems: ["Products"] });

        // second database
        await clickPickerItem(page, 0, "Databases");
        await enterSearchText(page, { text: "s", placeholder: "Search…" });
        await expect(localSearchTab(page, "Databases")).toBeChecked();
        await assertSearchResults(page, { foundItems: ["Birds"] });
      });

      test("should search for tables in a multi-schema database", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
        await mb.restore("postgres-writable");
        await resetTestTableMultiSchema();
        await mb.signInAsAdmin();
        await resyncDatabase(mb.api, {
          dbId: WRITABLE_DB_ID,
          tables: ["Animals", "Birds"],
        });

        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await pickEntity(page, {
          path: ["Databases", "Writable Postgres12"],
        });
        await enterSearchText(page, { text: "anim", placeholder: "Search…" });
        await expect(localSearchTab(page, "Databases")).toBeChecked();
        await expect(
          entityPickerModal(page).getByRole("link", {
            name: /animals.*wild/i,
          }),
        ).toHaveCount(1);
        await expect(
          entityPickerModal(page).getByRole("link", {
            name: /animals.*domestic/i,
          }),
        ).toHaveCount(1);
      });

      test("should search for tables in a schema-less database", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
        await mb.restore("mysql-8");
        await mb.signInAsAdmin();
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await pickEntity(page, { path: ["Databases", "QA MySQL8"] });
        await enterSearchText(page, { text: "orders", placeholder: "Search…" });
        await expect(localSearchTab(page, "Databases")).toBeChecked();
        await expect(
          entityPickerModal(page).getByRole("link", {
            name: /orders.*QA MySQL8/i,
          }),
        ).toHaveCount(1);
      });
    });

    test.describe("cards", () => {
      test("should select a card from local search results", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        await createTestCards(mb.api);
        await mb.signInAsNormalUser();

        const testCases = [
          { cardName: "Root question 1", sourceName: "Root question 1" },
          { cardName: "Root model 2", sourceName: "Root model 2" },
          { cardName: "Root metric 1", sourceName: "Orders" },
        ];
        for (const { cardName, sourceName } of testCases) {
          await startNewQuestion(page);
          await miniPickerBrowseAll(page).click();
          await clickPickerItem(page, 0, "Our analytics");
          await enterSearchText(page, {
            text: cardName,
            placeholder: /Search/,
          });
          await entityPickerModal(page)
            .getByText(cardName, { exact: true })
            .click();

          await expect(
            getNotebookStep(page, "data").getByText(sourceName, {
              exact: true,
            }),
          ).toBeVisible();
          await visualize(page);
        }
      });

      test("should select a card from global search results", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        await createTestCards(mb.api);
        await mb.signInAsNormalUser();

        const testCases = [
          { cardName: "Regular question 1", sourceName: "Regular question 1" },
          { cardName: "Regular model 2", sourceName: "Regular model 2" },
          { cardName: "Regular metric 1", sourceName: "Orders" },
        ];
        for (const { cardName, sourceName } of testCases) {
          await startNewQuestion(page);
          await miniPickerBrowseAll(page).click();
          await enterSearchText(page, {
            text: cardName,
            placeholder: /Search/,
          });
          await selectGlobalSearchTab(page);
          await entityPickerModal(page)
            .getByText(cardName, { exact: true })
            .click();

          await expect(
            getNotebookStep(page, "data").getByText(sourceName, {
              exact: true,
            }),
          ).toBeVisible();
          await visualize(page);
        }

        // should find dashboard questions in global search
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await enterSearchText(page, {
          text: "Dashboard question 1",
          placeholder: "Search…",
        });
        await selectGlobalSearchTab(page);
        await entityPickerModal(page)
          .getByText("Orders Dashboard question 1", { exact: true })
          .click();

        await expect(
          getNotebookStep(page, "data").getByText(
            "Orders Dashboard question 1",
            { exact: true },
          ),
        ).toBeVisible();
        await visualize(page);
      });

      test("should search for cards for a normal user", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        await createTestCards(mb.api);
        await mb.signInAsNormalUser();
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await testCardSearchForNormalUser(page);
      });

      test("should search for cards when there is no access to the root collection", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        await createTestCards(mb.api);
        // grant `nocollection` user access to `First collection`
        // (personal collections are always available)
        await updateCollectionGraph(mb.api, {
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        await mb.signIn(cachedUserName("nocollection"));
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await testCardSearchForInaccessibleRootCollection(page);
      });

      test("should not allow local search for `all personal collections`", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        await createTestCards(mb.api);
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await testCardSearchForAllPersonalCollections(page);
      });
    });
  });

  test.describe("question picker", () => {
    test("should select a card from local search results", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestCards(mb.api);
      await mb.signInAsNormalUser();

      const testCases = [
        { cardName: "Root question 1" },
        { cardName: "Root model 2" },
        { cardName: "Root metric 1" },
      ];
      for (const { cardName } of testCases) {
        await selectQuestionFromDashboard(page, mb.api);
        await enterSearchText(page, {
          text: cardName,
          placeholder: "Search…",
        });
        await entityPickerModal(page)
          .getByText(cardName, { exact: true })
          .click();

        await expect(
          getDashboardCard(page).getByText(cardName, { exact: true }),
        ).toBeVisible();
      }
    });

    test("should select a card from global search results", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestCards(mb.api);
      await mb.signInAsNormalUser();

      const testCases = [
        { cardName: "Regular question 1" },
        { cardName: "Regular model 2" },
        { cardName: "Regular metric 1" },
      ];
      for (const { cardName } of testCases) {
        await selectQuestionFromDashboard(page, mb.api);
        await enterSearchText(page, {
          text: cardName,
          placeholder: "Search…",
        });
        await selectGlobalSearchTab(page);
        await entityPickerModal(page)
          .getByText(cardName, { exact: true })
          .click();

        await expect(
          getDashboardCard(page).getByText(cardName, { exact: true }),
        ).toBeVisible();
      }
    });

    test("should search for cards for a normal user", async ({ page, mb }) => {
      await mb.signInAsAdmin();
      await createTestCards(mb.api);
      await mb.signInAsNormalUser();
      await selectQuestionFromDashboard(page, mb.api);
      await testCardSearchForNormalUser(page);
    });

    test("should search for cards when there is no access to the root collection", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestCards(mb.api);
      // grant `nocollection` user write access to `First collection`
      await updateCollectionGraph(mb.api, {
        [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "write" },
      });

      await mb.signIn(cachedUserName("nocollection"));
      await selectQuestionFromDashboard(page, mb.api, {
        collection_id: FIRST_COLLECTION_ID,
      });
      await testCardSearchForInaccessibleRootCollection(page);
    });

    test("should not allow local search for `all personal collections`", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestCards(mb.api);
      await selectQuestionFromDashboard(page, mb.api);
      await testCardSearchForAllPersonalCollections(page);
    });
  });

  test.describe("collection picker", () => {
    test("should select a collection from local search results", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Move");

      await pickEntity(page, { path: ["Our analytics", "First collection"] });
      await enterSearchText(page, { text: "second", placeholder: "Search…" });
      await expect(localSearchTab(page, "First collection")).toBeChecked();
      await entityPickerModal(page)
        .getByText("Second collection", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Move", exact: true })
        .click();

      await expect(
        undoToast(page).getByText("Second collection", { exact: true }),
      ).toBeVisible();
    });

    test("should select a collection from global search results", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Move");

      await pickEntity(page, { path: ["Our analytics", "First collection"] });
      await enterSearchText(page, { text: "second", placeholder: "Search…" });
      await selectGlobalSearchTab(page);
      await entityPickerModal(page)
        .getByText("Second collection", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Move", exact: true })
        .click();

      await expect(
        undoToast(page).getByText("Second collection", { exact: true }),
      ).toBeVisible();
    });

    test("should search for collections for a normal user", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestCollections(mb.api);
      await mb.signInAsNormalUser();
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Move");

      await clickPickerItem(page, 1, "First collection");
      await enterSearchText(page, {
        text: "collection",
        placeholder: "Search…",
      });
      await expect(localSearchTab(page, "First collection")).toBeChecked();
      await assertSearchResults(page, {
        foundItems: ["Second collection"],
        // notFoundItems: ["First collection"], — commented out upstream too
      });
      await selectGlobalSearchTab(page);
      await assertSearchResults(page, {
        foundItems: ["First collection", "Second collection"],
      });
      await selectLocalSearchTab(page, "First collection");
      await assertSearchResults(page, {
        foundItems: ["Second collection"],
      });

      // personal collection
      await clickPickerItem(page, 0, /Personal Collection/);
      await enterSearchText(page, {
        text: "personal collection 1",
        placeholder: "Search…",
      });
      await expect(localSearchTab(page, /robert tableton/i)).toBeChecked();
      await assertSearchResults(page, {
        foundItems: ["Normal personal collection 1"],
        notFoundItems: [
          "Normal personal collection 2",
          "Admin personal collection 1",
        ],
      });
    });

    test("should search for collections when there is no access to the root collection", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      const anotherCollectionId = await createTestCollections(mb.api);
      // grant `nocollection` user access to `First collection` and
      // `Another collection` (personal collections are always available)
      await updateCollectionGraph(mb.api, {
        [ALL_USERS_GROUP]: {
          [FIRST_COLLECTION_ID]: "write",
          [anotherCollectionId]: "write",
        },
      });

      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: FIRST_COLLECTION_ID,
      });

      await mb.signIn(cachedUserName("nocollection"));
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Move");

      // root collection
      await clickPickerItem(page, 0, "Collections");
      await enterSearchText(page, {
        text: "collection",
        placeholder: "Search…",
      });
      await expect(globalSearchTab(page)).toBeChecked();
      await assertSearchResults(page, {
        foundItems: ["Another collection"],
        // NOTE: capital "C" — an exact findByText can never match the real
        // "First collection", so this assertion is vacuous upstream. Ported
        // literally rather than silently strengthened.
        notFoundItems: ["First Collection"],
      });

      // personal collection
      await clickPickerItem(page, 0, /Personal Collection/);
      await enterSearchText(page, {
        text: "personal collection 2",
        placeholder: "Search…",
      });
      await expect(localSearchTab(page, /no collection/i)).toBeChecked();
      await assertSearchResults(page, {
        foundItems: ["No collection personal collection 2"],
        notFoundItems: [
          "No collection personal collection 1",
          "Admin personal collection 2",
          "Normal personal collection 2",
        ],
      });
    });

    test("should not allow local search for `all personal collections`", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestCollections(mb.api);
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Move");

      await clickPickerItem(page, 0, "All personal collections");
      const awaitSearch = await enterSearchTextDeferred(page, {
        text: "personal collection",
        placeholder: "Search…",
      });
      // Upstream's instant — see assertNoSearchScopeSelectorYet.
      await assertNoSearchScopeSelectorYet(page);
      await awaitSearch();
      await expect(
        localSearchTab(page, "All personal collections"),
      ).toHaveCount(0);
      await assertSearchResults(page, {
        foundItems: [
          "Admin personal collection 1",
          "Admin personal collection 2",
          "Normal personal collection 1",
          // "Normal personal collection 2" exists but is just barely below the
          // virtualized viewport — upstream says the same.
        ],
      });
    });

    test("Should properly render a path from other users personal collections", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestCollections(mb.api);
      await page.goto("/");
      await newButton(page).click();
      await popover(page).getByText("Dashboard", { exact: true }).click();

      await modal(page)
        .getByLabel("Which collection should this go in?", { exact: true })
        .click();

      await pickEntity(page, {
        path: [
          "All personal collections",
          "Robert Tableton's Personal Collection",
          "Normal personal collection 2",
        ],
      });
      await entityPickerModal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();

      // Re-open the collection picker to ensure that the path is generated
      // properly
      await modal(page)
        .getByLabel("Which collection should this go in?", { exact: true })
        .click();

      await expect(
        entityPickerModalItem(page, 0, "All personal collections"),
      ).toHaveAttribute("data-active", "true");
      await expect(
        entityPickerModalItem(page, 1, "Robert Tableton's Personal Collection"),
      ).toHaveAttribute("data-active", "true");
      await expect(
        entityPickerModalItem(page, 2, "Normal personal collection 2"),
      ).toHaveAttribute("data-active", "true");
    });

    test("should show dashboards in personal collections when apropriate, even if there are no sub collections", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createDashboard(mb.api, {
        collection_id: ADMIN_PERSONAL_COLLECTION_ID,
      });

      // cy.intercept("/api/database/*").as("database") — the wait is a settle
      // for the QB having its database metadata; the predicate is deliberately
      // broader than the Cypress glob so it cannot miss.
      const databaseResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith("/api/database/"),
      );
      await openTable(page, { table: ORDERS_ID });
      await databaseResponse;

      await page.getByRole("button", { name: "Save", exact: true }).click();
      const saveTarget = modal(page).getByLabel(
        "Where do you want to save this?",
        { exact: true },
      );
      await expect(saveTarget).toContainText("Orders in a dashboard");
      await saveTarget.click();

      await expect(
        entityPickerModalItem(page, 0, "Bobby Tables's Personal Collection"),
      ).toBeVisible();
      await expect(
        entityPickerModalItem(page, 1, "Orders in a dashboard"),
      ).toBeVisible();
      await pickEntity(page, {
        path: ["Bobby Tables's Personal Collection", "Test Dashboard"],
        leaf: true,
      });
      await entityPickerModal(page)
        .getByRole("button", { name: "Select this dashboard", exact: true })
        .click();

      await expect(
        modal(page).getByLabel("Where do you want to save this?", {
          exact: true,
        }),
      ).toContainText("Test Dashboard");
    });
  });

  test.describe("dashboard picker", () => {
    test("should select a dashboard from local search results", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestDashboards(mb.api);
      await mb.signInAsNormalUser();

      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
      await openQuestionActions(page, "Add to dashboard");
      await pickEntity(page, { path: ["Our analytics", "First collection"] });
      await enterSearchText(page, {
        text: "dashboard",
        placeholder: "Search…",
      });
      await expect(localSearchTab(page, "First collection")).toBeChecked();
      await entityPickerModal(page)
        .getByText("Regular dashboard 1", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();

      await expect(
        getDashboardCard(page, 0).getByText("Orders, Count", { exact: true }),
      ).toBeVisible();
    });

    test("should select a dashboard from global search results", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
      await openQuestionActions(page, "Add to dashboard");

      await clickPickerItem(page, 0, "Our analytics");
      await enterSearchText(page, {
        text: "dashboard",
        placeholder: "Search…",
      });
      await selectGlobalSearchTab(page);
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();

      await expect(
        getDashboardCard(page, 1).getByText("Orders, Count", { exact: true }),
      ).toBeVisible();
    });

    test("should search for dashboards for a normal user", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestDashboards(mb.api);
      await mb.signInAsNormalUser();
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Add to dashboard");

      await clickPickerItem(page, 1, "First collection");
      await enterSearchText(page, {
        text: "dashboard 1",
        placeholder: "Search…",
      });
      await expect(localSearchTab(page, "First collection")).toBeChecked();
      await assertSearchResults(page, {
        foundItems: ["Regular dashboard 1"],
        notFoundItems: ["Regular dashboard 2", "Root dashboard 1"],
      });
      await selectGlobalSearchTab(page);
      await assertSearchResults(page, {
        foundItems: ["Root dashboard 1", "Regular dashboard 1"],
      });
      await selectLocalSearchTab(page, "First collection");
      await assertSearchResults(page, {
        foundItems: ["Regular dashboard 1"],
        notFoundItems: [
          "Regular dashboard 2",
          "Root dashboard 1",
          "Personal dashboard 1",
        ],
      });

      // personal collection
      await clickPickerItem(page, 0, /Personal Collection/);
      await enterSearchText(page, {
        text: "personal dashboard 1",
        placeholder: "Search…",
      });
      await expect(localSearchTab(page, /robert tableton/i)).toBeChecked();
      await assertSearchResults(page, {
        foundItems: ["Normal personal dashboard 1"],
        notFoundItems: [
          "Normal personal dashboard 2",
          "Root dashboard 1",
          "Regular dashboard 1",
        ],
      });
    });

    test("should search for dashboards when there is no access to the root collection", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestDashboards(mb.api);
      // grant `nocollection` user access to `First collection`
      await updateCollectionGraph(mb.api, {
        [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "write" },
      });
      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: FIRST_COLLECTION_ID,
      });

      await mb.signIn(cachedUserName("nocollection"));
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Add to dashboard");

      // root collection
      await clickPickerItem(page, 0, "Collections");
      await enterSearchText(page, {
        text: "dashboard 1",
        placeholder: "Search…",
      });
      await expect(globalSearchTab(page)).toBeChecked();
      await assertSearchResults(page, {
        foundItems: ["Regular dashboard 1"],
        notFoundItems: ["Regular dashboard 2", "Root dashboard 1"],
      });

      // personal collection
      await clickPickerItem(page, 0, /Personal Collection/);
      await enterSearchText(page, {
        text: "personal dashboard 2",
        placeholder: "Search…",
      });
      await expect(localSearchTab(page, /no collection/i)).toBeChecked();
      await assertSearchResults(page, {
        foundItems: ["No collection personal dashboard 2"],
        notFoundItems: [
          "No collection personal dashboard 1",
          "Root dashboard 2",
          "Admin personal dashboard 2",
          "Normal personal dashboard 2",
        ],
      });
    });

    test("should not allow local search for `all personal collections`", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTestDashboards(mb.api);
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Add to dashboard");

      await clickPickerItem(page, 0, "All personal collections");
      const awaitSearch = await enterSearchTextDeferred(page, {
        text: "personal dashboard",
        placeholder: "Search…",
      });
      // Upstream's instant — see assertNoSearchScopeSelectorYet.
      await assertNoSearchScopeSelectorYet(page);
      await awaitSearch();
      await expect(
        localSearchTab(page, "All personal collections"),
      ).toHaveCount(0);
      await assertSearchResults(page, {
        foundItems: [
          "Admin personal dashboard 1",
          "Admin personal dashboard 2",
          "Normal personal dashboard 1",
          "Normal personal dashboard 2",
        ],
      });
    });
  });

  test.describe("misc entity picker stuff", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should handle esc properly", async ({ page }) => {
      await page.goto("/");

      // New Collection Flow
      await startNewCollectionFromSidebar(page);
      await page
        .getByTestId("new-collection-modal")
        .getByLabel(/Collection it's saved in/)
        .click();

      await entityPickerModal(page)
        .getByRole("button", { name: /New collection/ })
        .click();

      await closeAndAssertModal(page, () => collectionOnTheGoModal(page));
      await closeAndAssertModal(page, () => entityPickerModal(page));
      await closeAndAssertModal(page, () =>
        page.getByRole("dialog", { name: "New collection", exact: true }),
      );

      // New Dashboard
      await newButton(page).click();
      await popover(page).getByText("Dashboard", { exact: true }).click();
      await modal(page)
        .getByLabel(/Which collection/)
        .click();

      await entityPickerModal(page)
        .getByRole("button", { name: /New collection/ })
        .click();

      await closeAndAssertModal(page, () => collectionOnTheGoModal(page));
      await closeAndAssertModal(page, () => entityPickerModal(page));
      await closeAndAssertModal(page, () =>
        page.getByRole("dialog", { name: "New dashboard", exact: true }),
      );

      await newButton(page).click();
      await popover(page).getByText("Question", { exact: true }).click();
      await miniPickerBrowseAll(page).click();
      await pickEntity(page, {
        path: ["Databases", "Sample Database", "People"],
        leaf: true,
      });
      await page
        .getByTestId("qb-header")
        .getByRole("button", { name: "Save", exact: true })
        .click();

      await modal(page)
        .getByLabel(/Where do you/)
        .click();

      await entityPickerModal(page)
        .getByRole("button", { name: /New collection/ })
        .click();

      await closeAndAssertModal(page, () => collectionOnTheGoModal(page));
      await closeAndAssertModal(page, () => entityPickerModal(page));
      await closeAndAssertModal(page, () =>
        page.getByRole("dialog", { name: "Save new question", exact: true }),
      );

      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Add to dashboard");

      await entityPickerModal(page)
        .getByRole("button", { name: /New dashboard/ })
        .click();

      await closeAndAssertModal(page, () => dashboardOnTheGoModal(page));
      await closeAndAssertModal(page, () => entityPickerModal(page));

      await openQuestionActions(page, "Duplicate");
      await modal(page)
        .getByLabel(/Where do you/)
        .click();

      // wait for data to avoid flakiness
      await expect(entityPickerModalLevel(page, 1)).toContainText(
        "First collection",
      );

      await closeAndAssertModal(page, () => entityPickerModal(page));
      await closeAndAssertModal(page, () =>
        page.getByRole("heading", { name: /Duplicate/ }),
      );
    });

    test("should grow in width as needed, but not shrink (metabase#55690)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1500, height: 800 });
      await page.goto("/");

      // New Collection Flow
      await startNewCollectionFromSidebar(page);
      await page
        .getByTestId("new-collection-modal")
        .getByLabel(/Collection it's saved in/)
        .click();

      // Initial width of entity picker
      await expectPickerDialogWidth(page, "920px");

      await clickPickerItem(page, 1, "First collection");

      // Entity picker should grow
      await expectPickerDialogWidth(page, "1097px");

      await clickPickerItem(page, 2, "Second collection");

      // Max width is 80% of the viewport. Here, we get horizontal scrolling
      await expectPickerDialogWidth(page, "1200px");

      await clickPickerItem(page, 0, "Our analytics");

      // Entity picker should not shrink if we go back in the collection tree
      await expectPickerDialogWidth(page, "1198px");
    });

    test("should scroll to the left edge of the newly opened column", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto("/");

      await openNavigationSidebar(page);
      await startNewCollectionFromSidebar(page);
      await page
        .getByTestId("new-collection-modal")
        .getByLabel(/Collection it's saved in/)
        .click();

      // After opening, the first column (level 0) should be visible
      await expect(entityPickerModalLevel(page, 0)).toBeVisible();

      // Navigate into a collection
      await clickPickerItem(page, 1, "First collection");

      // The new column should be visible
      await expect(entityPickerModalLevel(page, 2)).toBeVisible();

      // The scroll container should be scrolled so that the new column's left
      // edge aligns with the container's left edge
      await expect(async () => {
        const measurement = await entityPickerModal(page)
          .getByTestId("nested-item-picker")
          .evaluate((container) => {
            const lastColumn = container.querySelector(
              "[data-testid='item-picker-level-2']",
            ) as HTMLElement | null;
            return lastColumn
              ? {
                  scrollLeft: container.scrollLeft,
                  offsetLeft: lastColumn.offsetLeft,
                }
              : null;
          });
        expect(measurement).not.toBeNull();
        expect(measurement!.scrollLeft).toBe(measurement!.offsetLeft);
      }).toPass({ timeout: 15_000 });
    });

    test("should restore previous path when clearing search from search results", async ({
      page,
    }) => {
      await page.goto("/");
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();
      await pickEntity(page, { path: ["Databases", "Sample Database"] });
      await enterSearchText(page, { text: "1", placeholder: "Search…" });
      await expect(
        entityPickerModal(page).getByText(/Search results for/i),
      ).toBeVisible();
      await entityPickerModal(page).getByTestId("clear-search").click();

      await expect(
        entityPickerModalItem(page, 1, "Sample Database"),
      ).toHaveAttribute("data-active", "true");
    });

    test("should not restore previous path when clearing search outside of search results", async ({
      page,
    }) => {
      await page.goto("/");
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();
      await pickEntity(page, { path: ["Databases", "Sample Database"] });
      await enterSearchText(page, { text: "1", placeholder: "Search…" });
      await expect(
        entityPickerModal(page).getByText(/Search results for/i),
      ).toBeVisible();
      // after clicking on Our Analytics, I shouldn't be returned to Sample
      // Database after clearing search
      await pickEntity(page, { path: ["Our analytics"] });
      await entityPickerModal(page).getByTestId("clear-search").click();

      await expect(
        entityPickerModalItem(page, 0, "Our analytics"),
      ).toHaveAttribute("data-active", "true");
    });
  });
});

/**
 * Port of `cy.findByRole("dialog", { name: "Select a collection" })
 * .should("have.css", "width").and("eq", width)`. Retried, because the picker
 * animates its width as columns mount.
 */
async function expectPickerDialogWidth(page: Page, width: string) {
  const dialog = page.getByRole("dialog", {
    name: "Select a collection",
    exact: true,
  });
  await expect
    .poll(
      async () =>
        dialog.evaluate((element) => getComputedStyle(element).width),
      { timeout: 15_000 },
    )
    .toBe(width);
}
