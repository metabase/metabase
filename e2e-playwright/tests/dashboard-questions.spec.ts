/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/dashboard-questions.cy.spec.js
 *
 * "Dashboard questions" — questions created/saved directly INTO a dashboard
 * (dashboard_id set on the card) rather than into a collection, plus the moves,
 * archives, search, and the collection-wide "migrate questions into their
 * dashboards" tool.
 *
 * Porting notes:
 * - The admin describe is token-gated (H.activateToken("pro-self-hosted")); the
 *   limited-users / migration describes are not (matching upstream). The jar is
 *   EE with a token so all three run.
 * - `cy.intercept(...).as(x)` + `cy.wait("@x")` become `page.waitForResponse`
 *   promises registered BEFORE the triggering action (PORTING rule 2). Aliases
 *   that were declared but never awaited (updateCard in "can edit …", saveQuestion
 *   in "save to a specific tab") are dropped.
 * - `cy.wait(Array(20).fill("@updateCard"))` → waitForCardUpdates(page, 20).
 * - `cy.url()/cy.location(...)` retried assertions → expect.poll (PORTING).
 * - No-change dashboard saves ("we're not actually saving any changes") use
 *   saveDashboardWithoutAwaitingRequests (no PUT fires → the PUT-awaiting
 *   saveDashboard would hang); real-change saves use saveDashboard.
 * - Toast/breadcrumb existence assertions use .first() (transient-UI strict-mode
 *   guard, PORTING).
 * - createMockDashboardCard + seedMigrationToolData + selectCollectionItem +
 *   the viewAll commandPaletteSearch live in support/dashboard-questions.ts.
 */
import { resolveToken } from "../support/api";
import {
  createDashboard,
  createQuestion,
  createQuestionAndDashboard,
  createDashboardWithTabs,
} from "../support/factories";
import {
  editDashboard,
  getDashboardCard,
  pickEntity,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import { showDashboardCardActions } from "../support/dashboard-cards";
import { removeDashboardCard } from "../support/dashboard-core";
import { addHeadingWhileEditing } from "../support/dashboard-parameters";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import {
  DASHBOARD_ONE,
  DASHBOARD_TWO,
  QUESTION_ONE,
  QUESTION_THREE,
  QUESTION_TWO,
  commandPaletteSearch,
  seedMigrationToolData,
  selectCollectionItem,
  waitForCardUpdates,
} from "../support/dashboard-questions";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  dashboardCards,
} from "../support/dashboard-tabs";
import { assertTabSelected } from "../support/dashboard-repros";
import { test, expect } from "../support/fixtures";
import { tooltip } from "../support/charts";
import { openCollectionItemMenu } from "../support/bookmarks-extras";
import { openCollectionMenu } from "../support/collections-core";
import { closeCommandPalette, commandPalette } from "../support/command-palette";
import { openQuestionActions } from "../support/models";
import { undoToast } from "../support/metrics";
import { openDashboardMenu } from "../support/organization";
import { startNewNativeQuestion, typeInNativeEditor } from "../support/native-editor";
import {
  entityPickerModal,
  getNotebookStep,
  miniPicker,
  visualize,
} from "../support/notebook";
import { rightSidebar } from "../support/question-saved";
import { visitCollection } from "../support/question-new";
import {
  openQuestionsSidebar,
  saveDashboardWithoutAwaitingRequests,
} from "../support/revisions";
import { openSharingMenu } from "../support/sharing";
import {
  saveDashcardVisualizerModal,
  selectDataset,
  showDashcardVisualizerModal,
  switchToAddMoreData,
} from "../support/visualizer-basics";
import { saveSavedQuestion } from "../support/viz-charts-repros";
import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  THIRD_COLLECTION_ID,
} from "../support/sample-data";
import type { UserName } from "../support/sample-data";
import {
  appBar,
  collectionTable,
  icon,
  main,
  modal,
  navigationSidebar,
  newButton,
  openNavigationSidebar,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

async function expectUrlIncludes(page: import("@playwright/test").Page, part: string) {
  await expect.poll(() => page.url()).toContain(part);
}

async function expectHashHasNoScrollTo(page: import("@playwright/test").Page) {
  await expect.poll(() => new URL(page.url()).hash).not.toContain("scrollTo");
}

test.describe("Dashboard > Dashboard Questions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("admin", () => {
    test.beforeEach(async ({ mb }) => {
      test.skip(
        !resolveToken("pro-self-hosted"),
        "requires the pro-self-hosted token",
      );
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("can save a new question to a dashboard and move it to a collection", async ({
      page,
      mb,
    }) => {
      // visit dash first to set it as recently opened
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

      await newButton(page).click();
      await popover(page).getByText("Question", { exact: true }).click();

      await miniPicker(page).getByText("Our analytics", { exact: true }).click();
      await miniPicker(page).getByText("Orders Model", { exact: true }).click();

      await getNotebookStep(page, "filter")
        .getByText("Add filters to narrow your answer", { exact: true })
        .click();
      await popover(page).getByText("Discount", { exact: true }).click();
      await page.getByPlaceholder("Min", { exact: true }).fill("1");
      await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();
      await visualize(page);

      await page.getByTestId("qb-save-button").click();
      await modal(page).getByLabel("Name", { exact: true }).fill("Orders with a discount");
      await expect(
        modal(page).getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();

      // should take you to the edit dashboard screen and auto-scroll to the new card
      await expectUrlIncludes(page, "/dashboard/");
      await expectHashHasNoScrollTo(page);
      await expect(
        dashboardCards(page).getByText("Orders with a discount", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByTestId("edit-bar").getByText("You're editing this dashboard."),
      ).toBeVisible();

      // we can't use the save dashboard util, because we're not actually saving any changes
      await saveDashboardWithoutAwaitingRequests(page);

      await dashboardCards(page)
        .getByText("Orders with a discount", { exact: true })
        .click();
      await expectUrlIncludes(page, "/question");
      // breadcrumb should say the dashboard name
      await expect(
        appBar(page).getByText("Orders in a dashboard", { exact: true }).first(),
      ).toBeVisible();
      await openQuestionActions(page, "Move");
      await entityPickerModal(page).getByText("First collection", { exact: true }).click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();

      await expect(
        modal(page).getByText(/do you still want this question to appear/i),
      ).toBeVisible();
      // defaults to yes
      await modal(page).getByRole("button", { name: "Done", exact: true }).click();
      await expect(
        undoToast(page).getByText("First collection", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        appBar(page).getByText("First collection", { exact: true }).first(),
      ).toBeVisible(); // breadcrumb should change
      await expect(
        appBar(page).getByText("Orders in a dashboard", { exact: true }),
      ).toHaveCount(0); // dashboard name should no longer be visible

      // card should still be visible in dashboard
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Orders with a discount", { exact: true }),
      ).toBeVisible();
    });

    test("can move an existing question between a dashboard and a collection", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, {
        name: "Total Orders that should stay",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      const myQuestion = await createQuestion(mb.api, {
        name: "Total Orders",
        collection_id: FIRST_COLLECTION_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });
      await visitQuestion(page, myQuestion.id);

      await openQuestionActions(page, "Move");
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();
      await expect(
        undoToast(page).getByText("Orders in a dashboard", { exact: true }).first(),
      ).toBeVisible();
      await saveDashboardWithoutAwaitingRequests(page);

      await dashboardCards(page).getByText("Total Orders", { exact: true }).click();
      await openQuestionActions(page);
      await expect(
        popover(page).getByText("Turn into a model", { exact: true }),
      ).toHaveCount(0);
      await expect(
        popover(page).getByText("Add to dashboard", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Navigation bar")).toContainText(
        "Orders in a dashboard",
      );

      await page.goto(`/collection/${FIRST_COLLECTION_ID}`);
      await expect(
        collectionTable(page).getByText("Second collection", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText("Total Orders", { exact: true }),
      ).toHaveCount(0);

      await visitQuestion(page, myQuestion.id);

      await openQuestionActions(page, "Move");
      await entityPickerModal(page).getByText("First collection", { exact: true }).click();
      await entityPickerModal(page).getByText("Second collection", { exact: true }).click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();
      await expect(
        modal(page).getByText(/do you still want this question to appear/i),
      ).toBeVisible();
      await modal(page).getByText(/no, remove it/i).click();
      await modal(page).getByRole("button", { name: "Done", exact: true }).click();

      await expect(
        undoToast(page).getByText("Second collection", { exact: true }).first(),
      ).toBeVisible();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Total Orders", { exact: true }),
      ).toHaveCount(0);

      // test moving a question while keeping the dashcard
      await dashboardCards(page)
        .getByText("Total Orders that should stay", { exact: true })
        .click();

      await openQuestionActions(page, "Move");
      await entityPickerModal(page).getByText("First collection", { exact: true }).click();
      await entityPickerModal(page).getByText("Second collection", { exact: true }).click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();
      await expect(
        modal(page).getByText(/do you still want this question to appear/i),
      ).toBeVisible();
      await expect(
        modal(page).getByRole("radio", {
          name: /Yes, it should still appear there/i,
        }),
      ).toBeChecked();
      await modal(page).getByRole("button", { name: "Done", exact: true }).click();

      await expect(
        undoToast(page).getByText("Second collection", { exact: true }).first(),
      ).toBeVisible();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Total Orders that should stay", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("can move a dashboard question between dashboards", async ({
      page,
      mb,
    }) => {
      const anotherDashboard = await createDashboard(mb.api, {
        name: "Another dashboard",
        collection_id: FIRST_COLLECTION_ID,
      });

      const myQuestion = await createQuestion(mb.api, {
        name: "Total Orders",
        dashboard_id: anotherDashboard.id,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });
      await visitQuestion(page, myQuestion.id);

      await expect(
        appBar(page).getByText("Another dashboard", { exact: true }).first(),
      ).toBeVisible();

      await openQuestionActions(page, "Move");
      await entityPickerModal(page).getByText("Our analytics", { exact: true }).click();
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();
      await expect(
        modal(page).getByText(
          /Moving this question to another dashboard will remove it/i,
        ),
      ).toBeVisible();
      await modal(page).getByRole("button", { name: "Okay", exact: true }).click();

      // its in the new dash and auto-scrolls to the card
      await expectUrlIncludes(page, "/dashboard/");
      await expectHashHasNoScrollTo(page);
      await expect(
        dashboardCards(page).getByText("Total Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        undoToast(page).getByText("Orders in a dashboard", { exact: true }).first(),
      ).toBeVisible();
      await expect(dashboardCards(page)).toContainText("Total Orders");

      // and not in the old dash
      await visitDashboard(page, mb.api, anotherDashboard.id);
      await expect(
        page.getByRole("heading", { name: "This dashboard is empty" }),
      ).toBeVisible();
    });

    test("can bulk move questions into a dashboard", async ({ page, mb }) => {
      for (let i = 0; i < 20; i++) {
        await createQuestion(mb.api, {
          name: `Question ${i + 1}`,
          collection_id: THIRD_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.PRODUCTS_ID,
            limit: i + 1,
          },
          display: "scalar",
        });
      }

      await visitCollection(page, THIRD_COLLECTION_ID);

      await collectionTable(page).getByLabel("Select all items", { exact: true }).click();

      const twentyUpdates = waitForCardUpdates(page, 20);
      await page
        .getByTestId("toast-card")
        .getByRole("button", { name: "Move", exact: true })
        .click();
      await expect(
        entityPickerModal(page).getByText(/Move 20 items/),
      ).toBeVisible();
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();

      // we shouldn't be making 20 requests here — but their staggered tail can
      // land slowly, so allow the counting promise plenty of time.
      await twentyUpdates;

      await expect(
        undoToast(page).getByText("Moved 20 questions", { exact: true }).first(),
      ).toBeVisible();

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

      for (let i = 0; i < 20; i++) {
        // A scalar card renders its name on both the caption title and the
        // viz root — assert the first (existence, like Cypress findByText).
        await expect(
          dashboardCards(page)
            .getByText(`Question ${i + 1}`, { exact: true })
            .first(),
        ).toBeVisible();
      }

      // add coverage for a previous bug where moving 2 or more questions where
      // at least one was not used by any dashboard and another was would cause a
      // runtime error and show an error boundary around collection items
      await visitCollection(page, "root");
      await selectCollectionItem(page, "Orders");
      await selectCollectionItem(page, "Orders, Count");

      const twoUpdates = waitForCardUpdates(page, 2);
      await page
        .getByTestId("toast-card")
        .getByRole("button", { name: "Move", exact: true })
        .click();
      await expect(entityPickerModal(page).getByText(/Move 2 items/)).toBeVisible();
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();

      await twoUpdates;
      await expect(page.getByTestId("error-boundary")).toHaveCount(0);
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Orders", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashboardCards(page).getByText("Orders, Count", { exact: true }).first(),
      ).toBeVisible();
    });

    test("should tell users which dashboards will be affected when doing bulk question moves", async ({
      page,
      mb,
    }) => {
      await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Sample Question",
          collection_id: THIRD_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.PRODUCTS_ID,
            limit: 1,
          },
          display: "scalar",
        },
        dashboardDetails: {
          collection_id: THIRD_COLLECTION_ID,
          name: "Test Dashboard",
        },
      });

      await visitCollection(page, THIRD_COLLECTION_ID);
      await selectCollectionItem(page, "Sample Question");

      await page
        .getByTestId("toast-card")
        .getByRole("button", { name: "Move", exact: true })
        .click();

      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();

      await expect(
        page.getByRole("dialog", { name: /Move this question/ }),
      ).toBeVisible();

      await expect(modal(page).getByText("Sample Question", { exact: true })).toBeVisible();
      await expect(modal(page).getByText("Test Dashboard", { exact: true })).toBeVisible();
      await modal(page).getByRole("button", { name: "Move it", exact: true }).click();

      await collectionTable(page).getByText("Test Dashboard", { exact: true }).click();

      await expect(
        page
          .getByTestId("dashboard-empty-state")
          .getByText("This dashboard is empty", { exact: true }),
      ).toBeVisible();

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Sample Question", { exact: true }),
      ).toBeVisible();
    });

    test("can edit a dashboard question", async ({ page, mb }) => {
      const question = await createQuestion(mb.api, {
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });
      await visitQuestion(page, question.id);

      await expect(
        appBar(page).getByText("Orders in a dashboard", { exact: true }).first(),
      ).toBeVisible();

      await queryBuilderHeader(page).getByRole("button", { name: /Summarize/ }).click();
      await rightSidebar(page).getByText("Count", { exact: true }).click();
      await popover(page).getByText(/Average of/).click();
      await popover(page).getByText("Total", { exact: true }).click();
      await saveSavedQuestion(page);

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Total Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        dashboardCards(page).getByText("80.52", { exact: true }),
      ).toBeVisible();
    });

    test("can save a question directly to a dashboard", async ({ page, mb }) => {
      const dashboard = await createDashboard(mb.api, {
        name: "Test Dash",
        collection_id: THIRD_COLLECTION_ID,
      });

      // Simulate having picked the dashboard in the entity picker previously
      await mb.api.post("/api/activity/recents", {
        context: "selection",
        model: "dashboard",
        model_id: dashboard.id,
      });

      await page.goto("/");

      await newButton(page).click();
      await popover(page).getByText("Question", { exact: true }).click();
      await miniPicker(page).getByText("Sample Database", { exact: true }).click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();
      await queryBuilderHeader(page).getByText("Save", { exact: true }).click();
      await expect(
        page.getByLabel(/Where do you want to save/),
      ).toHaveText("Test Dash");

      await modal(page).getByRole("button", { name: "Save", exact: true }).click();

      await expect(
        page.getByTestId("edit-bar").getByText("You're editing this dashboard."),
      ).toBeVisible();
    });

    test("can save a native question to a dashboard", async ({ page }) => {
      await startNewNativeQuestion(page, { query: "SELECT 123" });

      // this reduces the flakiness
      await page.waitForTimeout(500);

      const createCard = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/card",
      );

      await queryBuilderHeader(page).getByRole("button", { name: "Save", exact: true }).click();
      await modal(page).getByLabel("Name", { exact: true }).fill("Half Orders");
      await expect(
        modal(page).getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible(); // save location
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();

      await createCard;
      await saveDashboardWithoutAwaitingRequests(page);
      await expect(
        dashboardCards(page).getByText("Half Orders", { exact: true }),
      ).toBeVisible();
    });

    test("can find dashboard questions in the search", async ({ page, mb }) => {
      await createQuestion(mb.api, {
        name: "Total Orders Dashboard Question",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      await page.goto("/");

      await commandPaletteSearch(page, "Total Orders", false);

      // Command palette should show the dashboard question
      await expect(
        commandPalette(page).getByText("Total Orders Dashboard Question", {
          exact: true,
        }),
      ).toBeVisible();

      // Command palette should show the dashboard question in the dashboard
      await expect(
        commandPalette(page)
          .locator("a")
          .filter({ hasText: "Total Orders Dashboard Question" })
          .getByText(/Orders in a dashboard/),
      ).toBeVisible();
      await closeCommandPalette(page);

      // Search page should show the dashboard question in the dashboard
      await commandPaletteSearch(page, "Total Orders");
      await expect(commandPalette(page)).toHaveCount(0);

      await expect(
        page
          .getByTestId("search-result-item")
          .filter({ hasText: "Total Orders Dashboard Question" })
          .getByRole("link", { name: /Orders in a dashboard/ }),
      ).toBeVisible();
    });

    test("can move a question into a dashboard that already has a dashcard with the same question", async ({
      page,
      mb,
    }) => {
      const cardDashboards = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/cards/dashboards",
      );
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openQuestionActions(page, "Move");
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();
      // Quick check to ensure that the move confirmation modal doesn't hang around
      await cardDashboards;
      await expect(modal(page)).toHaveCount(0);
      // should only have one instance of this card
      await expect(
        dashboardCards(page).getByText("Orders", { exact: true }),
      ).toHaveCount(1);
    });

    test("can share a dashboard card via public link", async ({ page, mb }) => {
      const question = await createQuestion(mb.api, {
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });
      await visitQuestion(page, question.id);

      await openSharingMenu(page, "Create a public link");
      const input = page.getByTestId("public-link-input");
      await expect(input).not.toHaveValue("");
      const publicLink = await input.inputValue();

      await mb.signOut();
      await page.goto(publicLink);
      await expect(
        page
          .getByTestId("embed-frame-header")
          .getByText("Total Orders", { exact: true }),
      ).toBeVisible();
    });

    test("preserves bookmarks when moving a question to a dashboard", async ({
      page,
      mb,
    }) => {
      // bookmark it
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await icon(queryBuilderHeader(page), "bookmark").click();
      await page.getByTestId("sidebar-toggle").click();
      await expect(
        navigationSidebar(page).getByText("Orders", { exact: true }).first(),
      ).toBeVisible();
      await openQuestionActions(page);

      // move it
      await popover(page).getByText("Move", { exact: true }).click();
      await expect(
        navigationSidebar(page).getByText("Orders", { exact: true }).first(),
      ).toBeVisible();
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      // it's still bookmarked
      await page.getByTestId("sidebar-toggle").click();
      await expect(
        navigationSidebar(page).getByText("Orders", { exact: true }).first(),
      ).toBeVisible();
      await dashboardCards(page).getByText("Orders", { exact: true }).click();

      // unbookmark it
      await icon(queryBuilderHeader(page), "bookmark_filled").click();
      await page.getByTestId("sidebar-toggle").click();
      await expect(
        navigationSidebar(page).getByText("Collections", { exact: true }),
      ).toBeVisible();
      await expect(
        navigationSidebar(page).getByText("Orders", { exact: true }),
      ).toHaveCount(0);

      // bookmark it again
      await icon(queryBuilderHeader(page), "bookmark").click();
      await expect(
        navigationSidebar(page).getByText("Collections", { exact: true }),
      ).toBeVisible();
      await expect(
        navigationSidebar(page).getByText("Orders", { exact: true }).first(),
      ).toBeVisible();
    });

    test("shows trash action for the last dashcard for a dashboard question", async ({
      page,
      mb,
    }) => {
      const dashboard = await createDashboard(mb.api, { name: "Foo Dashboard" });
      const card = await createQuestion(mb.api, {
        name: "Foo dashboard question",
        query: { "source-table": SAMPLE_DATABASE.ORDERS_ID, limit: 5 },
        dashboard_id: dashboard.id,
      });
      await addOrUpdateDashboardCard(mb.api, {
        card_id: card.id,
        dashboard_id: dashboard.id,
        card: { size_x: 6, size_y: 6 },
      });

      await visitDashboard(page, mb.api, dashboard.id);
      await editDashboard(page);

      // should have trash option as only dashcard for dashboard question
      await showDashboardCardActions(page, 0);
      const panel0 = getDashboardCard(page, 0).getByTestId(
        "dashboardcard-actions-panel",
      );
      await icon(panel0, "trash").hover();
      await expect(
        tooltip(page).getByText("Remove and trash", { exact: true }),
      ).toBeVisible();

      // should have remove options if there's more than one dashcard for the
      // dashboard question
      await icon(panel0, "copy").click();
      await expect(page.getByTestId("dashcard")).toHaveCount(2);
      await showDashboardCardActions(page, 0);
      await expect(icon(panel0, "trash")).toHaveCount(0);
      await expect(icon(panel0, "close")).toBeVisible();

      // should have the trash option if changes leave only one dashcard for a question
      const card1 = page.getByTestId("dashcard").nth(1);
      await card1.hover();
      await icon(card1.getByTestId("dashboardcard-actions-panel"), "close").click();
      await expect(page.getByTestId("dashcard")).toHaveCount(1);
      await showDashboardCardActions(page, 0);
      await expect(icon(panel0, "trash")).toBeVisible();

      // should notify user that removal will also trash the card
      await icon(panel0, "trash").click();
      await expect(page.getByTestId("dashcard")).toHaveCount(0);
    });

    test("can delete a question from a dashboard without deleting all of the questions in metabase", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, {
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      const deletedCard = await createQuestion(mb.api, {
        name: "Total Orders deleted",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      // there has to be a card already in the trash from this dashboard for this to reproduce
      await mb.api.put(`/api/card/${deletedCard.id}`, { archived: true });

      // check that the 2 cards are there
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Total Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        dashboardCards(page).getByText("Orders", { exact: true }),
      ).toBeVisible();

      // remove the card saved inside the dashboard
      await editDashboard(page);
      const totalOrdersCard = page
        .getByTestId("dashcard")
        .filter({ hasText: "Total Orders" });
      await totalOrdersCard.hover();
      await icon(
        totalOrdersCard.getByTestId("dashboardcard-actions-panel"),
        "trash",
      ).click();
      await expect(
        undoToast(page).getByText("Trashed and removed card", { exact: true }).first(),
      ).toBeVisible();
      await saveDashboard(page);

      // check that we didn't accidentally delete everything
      await expect(
        dashboardCards(page).getByText("Total Orders", { exact: true }),
      ).toHaveCount(0);
      await expect(
        dashboardCards(page).getByText("Orders", { exact: true }),
      ).toBeVisible();
    });

    test("can archive and unarchive a dashboard with cards saved inside it", async ({
      page,
      mb,
    }) => {
      const dashboard = await createDashboard(mb.api, {
        name: "Dashboard with a title",
      });

      // add a text card to the dashboard
      await visitDashboard(page, mb.api, dashboard.id);
      await editDashboard(page);
      // note: we had a bug where archiving a dashboard with a text card first would crash
      await addHeadingWhileEditing(page, "A section");
      await saveDashboard(page);

      await createQuestion(mb.api, {
        name: "Total Orders",
        dashboard_id: dashboard.id,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      await createQuestion(mb.api, {
        name: "More Total Orders",
        dashboard_id: dashboard.id,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      await visitDashboard(page, mb.api, dashboard.id);
      await openDashboardMenu(page, "Move to trash");
      await modal(page).getByRole("button", { name: "Move to trash", exact: true }).click();
      await expect(page.getByText(/gone wrong/)).toHaveCount(0);
      await expect(
        page.getByTestId("archive-banner").getByText(/is in the trash/),
      ).toBeVisible();
      await openNavigationSidebar(page);

      // restore it
      await navigationSidebar(page).getByText("Trash", { exact: true }).click();
      await expect(
        collectionTable(page).getByText("Dashboard with a title", { exact: true }),
      ).toBeVisible();
      await openCollectionItemMenu(page, "Dashboard with a title");
      await popover(page).getByText("Restore", { exact: true }).click();

      // it's back
      await visitDashboard(page, mb.api, dashboard.id);
      await expect(page.getByTestId("archive-banner")).toHaveCount(0);

      // all the cards are there too
      await expect(
        dashboardCards(page).getByText("Total Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        dashboardCards(page).getByText("More Total Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        dashboardCards(page).getByText("A section", { exact: true }),
      ).toBeVisible();
    });

    test("can archive and unarchive a card within a dashboard", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, {
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      await createQuestion(mb.api, {
        name: "More Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      // archive it
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await dashboardCards(page).getByText("Total Orders", { exact: true }).click();
      await openQuestionActions(page, "Move to trash");
      // Anchor on the archive PUT — visitDashboard reads the dashboard via the
      // API, and if it runs before the archive commits it sees the (still-live)
      // dashcard and waits forever for a query the archived card never fires.
      const archived = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
      );
      await modal(page).getByRole("button", { name: "Move to trash", exact: true }).click();
      await archived;

      // check that it got removed
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Total Orders", { exact: true }),
      ).toHaveCount(0);

      // restore it
      await page.goto("/trash");
      await expect(
        collectionTable(page).getByText("Total Orders", { exact: true }),
      ).toBeVisible();
      await openCollectionItemMenu(page, "Total Orders");
      await popover(page).getByText("Restore", { exact: true }).click();
      await expect(
        undoToast(page)
          .getByText("Total Orders has been restored.", { exact: true })
          .first(),
      ).toBeVisible();

      // check that it got restored
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("Total Orders", { exact: true }),
      ).toBeVisible();
    });

    test("notifies the user about dashboards and dashcard series that a question will be removed from", async ({
      page,
      mb,
    }) => {
      const blue = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Blue Question",
          collection_id: FIRST_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [
              [
                "avg",
                [
                  "field",
                  SAMPLE_DATABASE.ORDERS.QUANTITY,
                  { "base-type": "type/Integer" },
                ],
              ],
            ],
            breakout: [
              [
                "field",
                SAMPLE_DATABASE.ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
          display: "line",
        },
        dashboardDetails: {
          name: "Blue Dashboard",
          collection_id: FIRST_COLLECTION_ID,
        },
      });
      const blueQuestionId = blue.questionId;

      const purple = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Purple Question",
          collection_id: FIRST_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [
              [
                "avg",
                [
                  "field",
                  SAMPLE_DATABASE.ORDERS.TOTAL,
                  { "base-type": "type/Float" },
                ],
              ],
            ],
            breakout: [
              [
                "field",
                SAMPLE_DATABASE.ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
          display: "line",
        },
        dashboardDetails: {
          name: "Purple Dashboard",
          collection_id: FIRST_COLLECTION_ID,
        },
      });
      await visitDashboard(page, mb.api, purple.dashboardId);

      // Add the blue question to the purple dashboard as an additional series
      await editDashboard(page);

      await showDashcardVisualizerModal(page, 0, { isVisualizerCard: false });

      await switchToAddMoreData(page);
      await selectDataset(page, "Blue Question");
      await saveDashcardVisualizerModal(page);

      // The modal-save dispatches a dashcard update; wait for the modal to
      // unmount and the new series to render before H.saveDashboard so the
      // edit-bar Save sees the dirty state (otherwise the PUT is skipped).
      await expect(
        getDashboardCard(page)
          .getByTestId("legend-item")
          .filter({ hasText: "Blue Question" })
          .first(),
      ).toBeVisible();

      await saveDashboard(page);
      await expect(
        getDashboardCard(page).getByTestId("chart-container"),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByTestId("chart-container").locator("svg"),
      ).toBeVisible();

      // Visit the question directly from a dashcard
      await getDashboardCard(page)
        .getByTestId("legend-item")
        .filter({ hasText: "Blue Question" })
        .first()
        .click();

      // Move the question to an entirely different dashboard
      await openQuestionActions(page, "Move");
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();

      // Should warn about removing from 2 dashboards. The first (blue) dashboard
      // contains the question as a dashcard; the second (purple) as a series.
      await expect(modal(page)).toContainText(
        "Blue Question will be removed from Blue Dashboard and Purple Dashboard",
      );

      // Simulate an error ONLY ON THE FIRST MOVE ATTEMPT
      let served400 = false;
      await page.route(
        new RegExp(`/api/card/${blueQuestionId}(?:[/?]|$)`),
        async (route) => {
          if (route.request().method() === "PUT" && !served400) {
            served400 = true;
            await route.fulfill({
              status: 400,
              contentType: "application/json",
              body: JSON.stringify({ message: "Ryan said no" }),
            });
          } else {
            await route.fallback();
          }
        },
      );

      // Simulated error should appear in the modal on the first attempt only.
      await modal(page).getByRole("button", { name: "Move it", exact: true }).click();
      await expect(modal(page).getByText("Ryan said no", { exact: true })).toBeVisible();

      // Continue with the expected behavior
      await modal(page).getByRole("button", { name: "Move it", exact: true }).click();

      // The question move succeeded
      await expect(
        page.getByRole("status").filter({ hasText: "Question moved" }).first(),
      ).toBeVisible();
      await expect(modal(page)).toHaveCount(0);
    });

    test("should be able to save a question to a specific tab", async ({
      page,
      mb,
    }) => {
      const NO_TABS_DASH_NAME = "Orders in a dashboard";
      const TABS_DASH_NAME = "Dashboard with tabs";
      const TAB_ONE_NAME = "First tab";
      const TAB_TWO_NAME = "Second tab";
      const DASHBOARD_QUESTION_NAME = "A tab two kind of question";

      await createDashboardWithTabs(mb.api, {
        name: TABS_DASH_NAME,
        tabs: [
          { id: -1, name: TAB_ONE_NAME },
          { id: -2, name: TAB_TWO_NAME },
        ],
        dashcards: [],
      });

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

      await newButton(page).click();
      await popover(page).getByText("SQL query", { exact: true }).click();
      await typeInNativeEditor(page, "SELECT 123;");

      await queryBuilderHeader(page).getByRole("button", { name: "Save", exact: true }).click();

      const saveModal = page.getByTestId("save-question-modal");
      await expect(
        saveModal.getByLabel(/Where do you want to save this/),
      ).toContainText(NO_TABS_DASH_NAME);
      await expect(
        saveModal.getByLabel(/Which tab should this go on/),
      ).toHaveCount(0);
      await saveModal.getByLabel(/Where do you want to save this/).click();

      await pickEntity(page, {
        path: ["Our analytics", "Dashboard with tabs"],
        select: true,
      });

      await expect(
        saveModal.getByLabel(/Where do you want to save this/),
      ).toContainText(TABS_DASH_NAME);
      await expect(
        saveModal.getByLabel(/Which tab should this go on/),
      ).toHaveValue(TAB_ONE_NAME);
      await saveModal.getByLabel(/Which tab should this go on/).click();

      await popover(page).getByText(TAB_TWO_NAME, { exact: true }).click();

      await expect(
        saveModal.getByLabel(/Which tab should this go on/),
      ).toHaveValue(TAB_TWO_NAME);
      await saveModal.getByLabel(/Name/).fill(DASHBOARD_QUESTION_NAME);
      await saveModal.getByRole("button", { name: "Save", exact: true }).click();

      // should navigate user to the tab the question was saved to
      await expectUrlIncludes(page, "/dashboard/");
      await expectHashHasNoScrollTo(page);
      await expect.poll(() => new URL(page.url()).search).toContain("tab");
      await assertTabSelected(page, TAB_TWO_NAME);
      await expect(
        dashboardCards(page).getByText(DASHBOARD_QUESTION_NAME, { exact: true }),
      ).toBeVisible();
    });

    test("should allow a user to copy a question into a tab", async ({
      page,
      mb,
    }) => {
      const TAB_ONE_NAME = "First tab";
      await createDashboardWithTabs(mb.api, {
        name: "Dashboard with tabs",
        tabs: [
          { id: -1, name: TAB_ONE_NAME },
          { id: -2, name: "Second tab" },
        ],
        dashcards: [],
      });

      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
      await openQuestionActions(page);
      await popover(page).getByText("Duplicate", { exact: true }).click();

      const saveModal = modal(page);
      await expect(
        saveModal.getByLabel(/Which tab should this go on/),
      ).toHaveCount(0);
      await saveModal.getByLabel(/Where do you want to save this/).click();

      await entityPickerModal(page).getByText("Dashboard with tabs", { exact: true }).click();
      await entityPickerModal(page)
        .getByText("Select this dashboard", { exact: true })
        .click();

      // avoid test flaking from two modals being open at once
      await expect(entityPickerModal(page)).toHaveCount(0);

      await expect(
        saveModal.getByLabel(/Which tab should this go on/),
      ).toHaveValue(TAB_ONE_NAME);
      await saveModal.getByText("Duplicate", { exact: true }).click();

      // should navigate user to the tab the question was saved to
      await expectUrlIncludes(page, "/dashboard/");
      await expectHashHasNoScrollTo(page);
      await expect.poll(() => new URL(page.url()).search).toContain("tab");
      await assertTabSelected(page, TAB_ONE_NAME);
      await expect(
        dashboardCards(page).getByText("Orders, Count - Duplicate", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("limited users", () => {
    test("cannot save dashboard question in a read only dashboard", async ({
      page,
      mb,
    }) => {
      await mb.signIn("readonlynosql" as UserName);

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await newButton(page).click();
      await popover(page).getByText("Question", { exact: true }).click();
      await miniPicker(page).getByText("Sample Database", { exact: true }).click();
      await miniPicker(page).getByText("Products", { exact: true }).click();

      await queryBuilderHeader(page).getByRole("button", { name: "Save", exact: true }).click();

      // should not show dashboard you can't write to (the Cypress @getADashboard
      // wait is satisfied retroactively by visitDashboard's GET, so the modal
      // is already populated — assert directly on it)
      await expect(modal(page)).toBeVisible();
      await expect(
        modal(page).getByText(/Orders in a dashboard/),
      ).toHaveCount(0);

      const saveQuestion = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/card",
      );
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();

      const response = await saveQuestion;
      expect(response.status()).toBe(200);
    });

    test("cannot move a question to a dashboard, when it would be removed from a read-only dashboard", async ({
      page,
      mb,
      context,
    }) => {
      await mb.signInAsAdmin();

      const totalOrdersQuestion = await createQuestion(mb.api, {
        name: "Total Orders Question",
        collection_id: null, // our analytics
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      const personalDashboard = await createDashboard(mb.api, {
        name: "Personal dashboard",
        collection_id: ADMIN_PERSONAL_COLLECTION_ID,
      });

      await visitDashboard(page, mb.api, personalDashboard.id);

      await editDashboard(page);
      await openQuestionsSidebar(page);
      await sidebar(page)
        .getByText(/our analyt/i)
        .click();
      await sidebar(page).getByText("Total Orders Question", { exact: true }).click();
      // Anchor the save on the dashcard being added (the click is async — the
      // Save can otherwise land before it applies and skip the PUT).
      await expect(
        dashboardCards(page).getByText("Total Orders Question", { exact: true }),
      ).toBeVisible();
      await saveDashboard(page);
      await expect(
        dashboardCards(page).getByText("Total Orders Question", { exact: true }),
      ).toBeVisible();

      await mb.signOut();
      await mb.signIn("normal");

      await visitQuestion(page, totalOrdersQuestion.id);

      const checkCardsInDashboards = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/cards/dashboards",
      );

      await openQuestionActions(page, "Move");
      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      await entityPickerModal(page).getByRole("button", { name: "Move", exact: true }).click();

      // We should get a modal saying that we can't move it into a dashboard
      // because it would move it out of a dashboard that we can't access
      await checkCardsInDashboards;
      await expect(
        main(page).getByText(/Sorry, you don’t have permission to see that./),
      ).toHaveCount(0);
      await expect(
        modal(page).getByText(/Can't move this question into a dashboard/i),
      ).toBeVisible();
    });
  });

  test.describe("migration modal", () => {
    test("should allow users to migrate questions in one dashboard into their respective dashboards", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await seedMigrationToolData(mb.api);

      // assert questions are in the collection
      await visitCollection(page, FIRST_COLLECTION_ID);
      await expect(
        collectionTable(page).getByText(QUESTION_ONE, { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText(QUESTION_TWO, { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText(QUESTION_THREE, { exact: true }),
      ).toBeVisible();

      // user should be able to engage with the tool
      await openCollectionMenu(page);
      await popover(page)
        .getByText("Move questions into their dashboards", { exact: true })
        .click();

      // info modal should appear on first visit. NB: the Mantine Modal root
      // carries the data-testid but has no box, so assert on its content, not
      // toBeVisible() on the root.
      const infoModal = page.getByTestId("move-questions-into-dashboard-info-modal");
      await expect(
        infoModal.getByText("Move questions into their dashboards?", { exact: true }),
      ).toBeVisible();
      await infoModal.getByText("Preview the changes", { exact: true }).click();
      // info modal should disappear
      await expect(infoModal).toHaveCount(0);

      // assert migration modal appears
      const migrationModal = page.getByTestId(
        "move-questions-into-dashboard-modal",
      );
      await expect(migrationModal.getByText(QUESTION_ONE, { exact: true })).toBeVisible();
      await expect(migrationModal.getByText(DASHBOARD_ONE, { exact: true })).toBeVisible();
      await expect(migrationModal.getByText(QUESTION_TWO, { exact: true })).toBeVisible();
      await expect(migrationModal.getByText(DASHBOARD_TWO, { exact: true })).toBeVisible();
      await expect(
        migrationModal.getByText(QUESTION_THREE, { exact: true }),
      ).toHaveCount(0);

      // migrate the dashboard question candidates
      await migrationModal.getByText("Move these questions", { exact: true }).click();
      await expect(migrationModal).toHaveCount(0);
      await expect(undoToast(page).first()).toBeVisible();

      // assert questions have been migrated out of the collection
      await expect(
        collectionTable(page).getByText(QUESTION_ONE, { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText(QUESTION_TWO, { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText(QUESTION_THREE, { exact: true }),
      ).toBeVisible();

      // assert questions have been migrated into their dashboards
      await collectionTable(page).getByText(DASHBOARD_ONE, { exact: true }).click();
      await expect(
        dashboardCards(page).getByText(QUESTION_ONE, { exact: true }),
      ).toBeVisible();
      await expect(
        dashboardCards(page).getByText(QUESTION_TWO, { exact: true }),
      ).toHaveCount(0);
      await expect(
        dashboardCards(page).getByText(QUESTION_THREE, { exact: true }),
      ).toBeVisible();
      await page.goBack();

      await collectionTable(page).getByText(DASHBOARD_TWO, { exact: true }).click();
      await expect(
        dashboardCards(page).getByText(QUESTION_ONE, { exact: true }),
      ).toHaveCount(0);
      await expect(
        dashboardCards(page).getByText(QUESTION_TWO, { exact: true }),
      ).toBeVisible();
      await expect(
        dashboardCards(page).getByText(QUESTION_THREE, { exact: true }),
      ).toBeVisible();
      await page.goBack();

      // assert option to migrate is no longer available
      await openCollectionMenu(page);
      await expect(
        popover(page).getByText("Move questions into their dashboards", {
          exact: true,
        }),
      ).toHaveCount(0);

      // should not show the info modal if user has acknowledged it previously
      await visitCollection(page, "root");
      await openCollectionMenu(page);
      await popover(page)
        .getByText("Move questions into their dashboards", { exact: true })
        .click();
      const migrationModal2 = page.getByTestId(
        "move-questions-into-dashboard-modal",
      );
      await expect(
        migrationModal2.getByText("Cancel", { exact: true }),
      ).toBeVisible();
      await migrationModal2.getByText("Cancel", { exact: true }).click();

      // should be immediately responsive to dashcard changes making new candidates
      await visitCollection(page, FIRST_COLLECTION_ID);
      await openCollectionMenu(page);
      await expect(
        popover(page).getByText("Move questions into their dashboards", {
          exact: true,
        }),
      ).toHaveCount(0);
      await collectionTable(page).getByText(DASHBOARD_ONE, { exact: true }).click();
      await editDashboard(page);
      await removeDashboardCard(page, 1); // removes card for QUESTION_THREE
      await saveDashboard(page);
      await appBar(page).getByText("First collection", { exact: true }).click(); // navigate via breadcrumbs to avoid page refresh
      await openCollectionMenu(page);
      await popover(page)
        .getByText("Move questions into their dashboards", { exact: true })
        .click();
      const migrationModal3 = page.getByTestId(
        "move-questions-into-dashboard-modal",
      );
      await expect(
        migrationModal3.getByText(QUESTION_THREE, { exact: true }),
      ).toBeVisible();
      await expect(
        migrationModal3.getByText(DASHBOARD_TWO, { exact: true }),
      ).toBeVisible();
    });

    test("should not show migration tool to non-admins", async ({ page, mb }) => {
      await mb.signInAsAdmin();
      await seedMigrationToolData(mb.api);
      await mb.signIn("normal");

      // assert questions are in the collection
      await visitCollection(page, FIRST_COLLECTION_ID);
      await expect(
        collectionTable(page).getByText(QUESTION_ONE, { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText(QUESTION_TWO, { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText(QUESTION_THREE, { exact: true }),
      ).toBeVisible();

      // user should not be able to engage with the tool
      await openCollectionMenu(page);
      await expect(
        popover(page).getByText("Move questions into their dashboards", {
          exact: true,
        }),
      ).toHaveCount(0);

      // should get redirect if the user navigates to url directly
      await page.goto(
        `/collection/${FIRST_COLLECTION_ID}/move-questions-dashboard`,
      );
      await expect.poll(() => page.url()).not.toContain("move-questions-dashboard");
      await expect.poll(() => page.url()).toContain(`/collection/${FIRST_COLLECTION_ID}`);
    });
  });
});
