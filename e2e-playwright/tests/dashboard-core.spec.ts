/**
 * Playwright port of e2e/test/scenarios/dashboard/dashboard.cy.spec.js
 *
 * Port notes:
 * - Snowplow helpers are no-op stubs (no snowplow-micro container in the
 *   spike harness).
 * - cy.spy() request-count intercepts become page.on("request") counters
 *   (countDashboardUpdates and the field-API counters).
 * - The 500-revert stub (cy.intercept with a body) becomes page.route.
 * - The "LOCAL TESTING ONLY" translated-placeholder test is tagged @skip
 *   upstream (metabase#15656: translations can't run in CI) and stays
 *   skipped here for the same reason.
 * - "should support auto-scrolling to a dashcard": the Cypress visit URL has
 *   a stray "}" (`/dashboard/${id}}`); dropped here. "not.be.visible" on the
 *   below-the-fold card maps to not.toBeInViewport (Playwright's toBeVisible
 *   ignores scroll position).
 * - The mobile/small-screen tests set the viewport via page.setViewportSize
 *   instead of Cypress per-test viewport config.
 */
import type { Page } from "@playwright/test";

import {
  dashboardHeader,
  editBar,
  editDashboard,
  filterWidget,
  getDashboardCard,
  modal,
  pickEntity,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { getDashboardCardMenu, icon } from "../support/dashboard-cards";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ENTITY_ID,
  GRID_WIDTH,
  addIFrameWhileEditing,
  assertDashboardFixedWidth,
  assertDashboardFullWidth,
  assertScrollBarExists,
  cachedUserName,
  checkOptionsForFilter,
  countDashboardUpdates,
  createCollection,
  createDashboardWithCards,
  createDashboardWithTabs,
  createNewTab,
  dashboardParametersPopover,
  deleteTab,
  dragOnXAxis,
  duplicateTab,
  editIFrameWhileEditing,
  getDashboardCards,
  getTextCardDetails,
  mapPinIcon,
  mockVirtualCard,
  mockVirtualDashCard,
  openProductsTable,
  removeDashboardCard,
  renameTab,
  updateDashboardCards,
  validateIFrame,
} from "../support/dashboard-core";
import {
  addOrUpdateDashboardCard,
  closeDashboardInfoSidebar,
  collectionEntry,
  createNativeQuestionAndDashboard,
  openDashboardInfoSidebar,
  waitForDashboardGet,
  waitForDashboardUpdate,
} from "../support/dashboard-management";
import { openLegacyStaticEmbeddingModal } from "../support/embedding";
import { test, expect } from "../support/fixtures";
import { miniPickerBrowseAll } from "../support/joins";
import { undoToast } from "../support/metrics";
import { typeInNativeEditor } from "../support/native-editor";
import { entityPickerModal } from "../support/notebook";
import { openDashboardMenu } from "../support/organization";
import { checkSavedToCollectionQuestionToast } from "../support/question-new";
import { openQuestionsSidebar, sidesheet } from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { main, saveQuestion } from "../support/sharing";
import {
  commandPalette,
  commandPaletteButton,
} from "../support/command-palette";
import {
  appBar,
  newButton,
  popover,
  queryBuilderHeader,
  visitDashboard,
} from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

// TODO: no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
  _count?: number,
) => {};

// There's a race condition when saving a dashboard
// and then immediately editing it again. After saving,
// we exit the edit mode and that can happen after
// `H.editDashboard` is called for some reason

test.describe("scenarios > dashboard", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("create", () => {
    test("new dashboard UI flow", async ({ page }) => {
      const dashboardName = "Dash A";
      const dashboardDescription = "Fresh new dashboard";
      const newQuestionName = "New dashboard question";

      await page.goto("/");
      await appBar(page).getByText("New", { exact: true }).click();
      const dashboardOption = popover(page).getByText("Dashboard", {
        exact: true,
      });
      await expect(dashboardOption).toBeVisible();
      await dashboardOption.click();

      // pressing escape should only close the entity picker modal, not the
      // new dashboard modal
      await modal(page).getByTestId("collection-picker-button").click();
      await page.keyboard.press("Escape");
      await expect(
        modal(page).getByText("New dashboard", { exact: true }),
      ).toBeVisible();

      // Create a new dashboard
      const dialog = modal(page);
      // Without waiting for this, the test was constantly flaking locally.
      await expect(
        dialog.getByText("Our analytics", { exact: true }),
      ).toBeVisible();
      await dialog
        .getByPlaceholder(/name of your dashboard/i)
        .fill(dashboardName);
      await dialog
        .getByLabel("Description", { exact: true })
        .fill(dashboardDescription);
      const createDashboard = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dashboard",
      );
      await dialog.getByRole("button", { name: "Create", exact: true }).click();

      // Router should immediately navigate to it
      const dashboard = (await (await createDashboard).json()) as {
        id: number;
      };
      await expect(page).toHaveURL(new RegExp(`/dashboard/${dashboard.id}`));

      // New dashboards are opened in editing mode by default
      await expect(page.getByTestId("dashboard-empty-state")).toContainText(
        "Create a new question or browse your collections for an existing one.",
      );
      await expect(
        editBar(page).getByText("You're editing this dashboard.", {
          exact: true,
        }),
      ).toBeVisible();

      // Should create new question from an empty dashboard (metabase#31848)
      await page
        .getByTestId("dashboard-empty-state")
        .getByRole("button", { name: "Add a chart", exact: true })
        .click();
      await page
        .getByTestId("new-button-bar")
        .getByText("New Question", { exact: true })
        .click();

      await miniPickerBrowseAll(page).click();
      const picker = entityPickerModal(page);
      await picker.getByText("Databases", { exact: true }).click();
      await picker
        .getByPlaceholder("Search…", { exact: true })
        .pressSequentially("Pro");
      await picker.getByText("Products", { exact: true }).click();

      const createQuestion = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/card",
      );
      await queryBuilderHeader(page).getByText("Save", { exact: true }).click();
      const saveModal = page.getByTestId("save-question-modal");
      await saveModal.getByLabel("Name", { exact: true }).fill(newQuestionName);
      await expect(
        saveModal.getByLabel("Where do you want to save this?"),
      ).toHaveCount(0);
      await saveModal.getByText("Save", { exact: true }).click();
      await createQuestion;

      await openQuestionsSidebar(page);
      await sidebar(page).getByText("Orders, Count", { exact: true }).click();

      await expect(getDashboardCards(page)).toHaveCount(2);

      await saveDashboard(page);

      // Breadcrumbs should show a collection dashboard was saved in
      await appBar(page).getByText("Our analytics", { exact: true }).click();

      // New dashboard question should not appear in the collection
      await expect(collectionEntry(page, dashboardName)).not.toHaveCount(0);
      await expect(collectionEntry(page, newQuestionName)).toHaveCount(0);
    });

    test("adding question to one dashboard shouldn't affect previously visited unrelated dashboards (metabase#26826)", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

      // Save new question from an ad-hoc query
      await openProductsTable(page);
      const saveQuestionResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/card",
      );
      await page
        .getByTestId("qb-header")
        .getByText("Save", { exact: true })
        .click();
      await page
        .getByTestId("save-question-modal")
        .getByTestId("dashboard-and-collection-picker-button")
        .click();
      await pickEntity(page, {
        path: ["Our analytics", "First collection"],
        select: true,
      });
      await page
        .getByTestId("save-question-modal")
        .getByText("Save", { exact: true })
        .click();
      await saveQuestionResponse;

      // Add this new question to a dashboard created on the fly
      await checkSavedToCollectionQuestionToast(page, true);

      // The "New dashboard" button stays disabled until the selected
      // collection's details (incl. can_write) load; clicking too early is a
      // no-op, so wait for it to be enabled before clicking.
      const newDashboardButton = entityPickerModal(page).getByRole("button", {
        name: "New dashboard",
        exact: true,
      });
      await expect(newDashboardButton).toBeEnabled();
      await newDashboardButton.click();
      const onTheGoModal = page.getByTestId("create-dashboard-on-the-go");
      await onTheGoModal
        .getByPlaceholder("My new dashboard", { exact: true })
        .fill("Foo");
      await onTheGoModal.getByText("Create", { exact: true }).click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();

      await expect(page.getByTestId("dashcard")).toBeVisible();
      await saveDashboard(page);

      // Find the originally visited (unrelated) dashboard in search and go
      // to it
      await commandPaletteButton(page).click();
      const palette = commandPalette(page);
      await expect(palette.getByText("Recents", { exact: true })).toBeVisible();
      await palette
        .getByRole("option", { name: "Orders in a dashboard", exact: true })
        .click();

      // It should not contain an alien card from the other dashboard
      await expect(getDashboardCards(page)).toHaveCount(1);
      await expect(getDashboardCards(page).first()).toContainText("37.65");
      // It should not open in editing mode
      await expect(editBar(page)).toHaveCount(0);
    });
  });

  test.describe("existing dashboard", () => {
    const originalDashboardName = "Amazing Dashboard";
    let dashboardId: number;

    test.beforeEach(async ({ page, mb }) => {
      const { id } = await mb.api.createDashboard({
        name: originalDashboardName,
      });
      dashboardId = id;
      await visitDashboard(page, mb.api, id);
    });

    test.describe("add a question (dashboard card)", () => {
      test("should be possible via questions sidebar", async ({ page }) => {
        const assertBothCardsArePresent = async () => {
          const cards = getDashboardCards(page);
          await expect(cards).toHaveCount(2);
          await expect(
            cards.filter({ hasText: "Orders, Count" }),
          ).not.toHaveCount(0);
          await expect(cards.filter({ hasText: "18,760" })).not.toHaveCount(0);
        };

        await editDashboard(page);
        await openQuestionsSidebar(page);

        // The list of saved questions
        await sidebar(page).getByText("Orders, Count", { exact: true }).click();

        // The search component
        const search = page.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname === "/api/search",
        );
        const searchInput = page.getByPlaceholder("Search…", { exact: true });
        await searchInput.pressSequentially("Orders");
        await searchInput.press("Enter");
        await search;
        await page
          .getByTestId("select-list")
          .getByText("Orders, Count", { exact: true })
          .click();

        // should show values of added dashboard card via search immediately
        // (metabase#15959)
        await assertBothCardsArePresent();

        // Remove one card
        await removeDashboardCard(page, 0);
        await expect(getDashboardCards(page)).toHaveCount(1);

        // It should be possible to undo remove that card
        const toast = page.getByTestId("toast-undo");
        await expect(
          toast.getByText("Removed card", { exact: true }),
        ).toBeVisible();
        await toast.getByRole("button", { name: "Undo", exact: true }).click();

        await assertBothCardsArePresent();
        await saveDashboard(page);
        await assertBothCardsArePresent();
      });

      test("should hide personal collections when adding questions to a dashboard in public collection", async ({
        page,
        mb,
      }) => {
        const collectionInRoot = { name: "Collection in root collection" };
        await createCollection(mb.api, collectionInRoot);
        const myPersonalCollection = "My personal collection";
        const { id: rootDashboardId } = await mb.api.createDashboard({
          name: "dashboard in root collection",
        });
        await visitDashboard(page, mb.api, rootDashboardId);

        // assert that personal collections are not visible
        await editDashboard(page);
        await openQuestionsSidebar(page);
        await expect(
          sidebar(page).getByText("Our analytics", { exact: true }),
        ).toBeVisible();
        await expect(
          sidebar(page).getByText(myPersonalCollection, { exact: true }),
        ).toHaveCount(0);
        await expect(
          sidebar(page).getByText(collectionInRoot.name, { exact: true }),
        ).toBeVisible();

        // Move dashboard to a personal collection
        await editBar(page)
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await openDashboardMenu(page, "Move");
        const picker = entityPickerModal(page);
        await picker
          .getByText("Bobby Tables's Personal Collection", { exact: true })
          .click();
        await picker.getByRole("button", { name: "Move", exact: true }).click();

        await editDashboard(page);
        await openQuestionsSidebar(page);
        // go to the root collection
        await sidebar(page).getByText("Our analytics", { exact: true }).click();
        await expect(
          sidebar(page).getByText(myPersonalCollection, { exact: true }),
        ).toBeVisible();
        await expect(
          sidebar(page).getByText(collectionInRoot.name, { exact: true }),
        ).toBeVisible();

        // Move dashboard back to a root collection
        await editBar(page)
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await openDashboardMenu(page, "Move");
        await entityPickerModal(page)
          .getByText("Our analytics", { exact: true })
          .click();
        await entityPickerModal(page)
          .getByRole("button", { name: "Move", exact: true })
          .click();

        await editDashboard(page);
        await openQuestionsSidebar(page);
        await expect(
          sidebar(page).getByText("Our analytics", { exact: true }),
        ).toBeVisible();
        await expect(
          sidebar(page).getByText(myPersonalCollection, { exact: true }),
        ).toHaveCount(0);
        await expect(
          sidebar(page).getByText(collectionInRoot.name, { exact: true }),
        ).toBeVisible();
      });

      test("should save a dashboard after adding a saved question from an empty state (metabase#29450)", async ({
        page,
      }) => {
        const emptyState = page.getByTestId("dashboard-empty-state");
        await expect(
          emptyState.getByText("This dashboard is empty", { exact: true }),
        ).toBeVisible();
        await emptyState.getByText("Add a chart", { exact: true }).click();

        await sidebar(page).getByText("Orders, Count", { exact: true }).click();

        // Anchor on the card actually landing before saving. Cypress's command
        // queue paces these apart; Playwright clicks Save immediately, and a
        // Save that lands before the dashcard is added finds the dashboard
        // not-dirty, exits edit mode without issuing the PUT, and saveDashboard
        // then times out waiting for it.
        await expect(getDashboardCards(page)).toHaveCount(1);

        await saveDashboard(page);

        const cards = getDashboardCards(page);
        await expect(cards).toHaveCount(1);
        await expect(cards.first()).toContainText("Orders, Count");
        await expect(cards.first()).toContainText("18,760");
      });

      test("should save changes to a dashboard after using the 'Add a chart' button from an empty tab (metabase#53132)", async ({
        page,
      }) => {
        // add an existing card
        await editDashboard(page);
        await icon(dashboardHeader(page), "add").click();
        await sidebar(page).getByText("Orders, Count", { exact: true }).click();
        // Same anchor as metabase#29450 above: the card add must land before
        // anything downstream depends on the dashboard being dirty.
        await expect(getDashboardCards(page)).toHaveCount(1);
        await icon(dashboardHeader(page), "add").click();

        // create a tab to access emtpy state again
        await createNewTab(page);
        await page
          .getByTestId("dashboard-empty-state")
          .getByText("Add a chart", { exact: true })
          .click();

        // save changes before leaving
        await sidebar(page).getByText("New SQL query", { exact: true }).click();
        await modal(page)
          .getByRole("button", { name: "Save changes", exact: true })
          .click();

        // create a dashboard question
        await typeInNativeEditor(page, "SELECT 1");
        await saveQuestion(page, "Foo question");

        // should have persisted changes from when dashboard was saved before
        // creating a question
        await expect(page.getByRole("tab", { name: /Tab \d/ })).toHaveCount(2);
        await expect(getDashboardCards(page)).toHaveCount(2);
      });

      test("should allow navigating to the notebook editor directly from a dashboard card", async ({
        page,
        mb,
      }) => {
        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
        await getDashboardCard(page).hover();
        await (await getDashboardCardMenu(page)).click();
        const editOption = popover(page).getByText("Edit question", {
          exact: true,
        });
        await expect(editOption).toBeVisible();
        await editOption.click();
        await expect(
          page.getByRole("button", { name: "Visualize", exact: true }),
        ).toBeVisible();
      });

      test("should allow navigating to the model editor directly from a dashboard card", async ({
        page,
        mb,
      }) => {
        const { questionId, dashboardId: modelDashboardId } =
          await mb.api.createQuestionAndDashboard({
            questionDetails: {
              name: "orders",
              type: "model",
              query: { "source-table": ORDERS_ID },
            },
            dashboardDetails: { name: "Dashboard" },
          });
        const slug = `${questionId}-orders`;
        await visitDashboard(page, mb.api, modelDashboardId);

        await getDashboardCard(page).hover();
        await (await getDashboardCardMenu(page)).click();
        const editOption = popover(page).getByText("Edit model", {
          exact: true,
        });
        await expect(editOption).toBeVisible();
        await editOption.click();
        await expect(page).toHaveURL(new RegExp(`/model/${slug}/query$`));
      });

      test("should allow navigating to the metric editor directly from a dashboard card", async ({
        page,
        mb,
      }) => {
        const { questionId, dashboardId: metricDashboardId } =
          await mb.api.createQuestionAndDashboard({
            questionDetails: {
              name: "orders",
              type: "metric",
              query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
            },
            dashboardDetails: { name: "Dashboard" },
          });
        const slug = `${questionId}-orders`;
        await visitDashboard(page, mb.api, metricDashboardId);

        await getDashboardCard(page).hover();
        await (await getDashboardCardMenu(page)).click();
        const editOption = popover(page).getByText("Edit metric", {
          exact: true,
        });
        await expect(editOption).toBeVisible();
        await editOption.click();
        await expect(page).toHaveURL(new RegExp(`/metric/${slug}/query$`));
      });
    });

    test.describe("title and description", () => {
      const newTitle = "Renamed";
      const newDescription = "Foo Bar";

      test("should update the name and description without entering the dashboard edit mode", async ({
        page,
      }) => {
        const updateCount = countDashboardUpdates(page);
        const heading = page.getByTestId("dashboard-name-heading");

        const titleUpdate = waitForDashboardUpdate(page, dashboardId);
        const titleGet = waitForDashboardGet(page, dashboardId);
        await heading.click();
        await page.keyboard.press("ControlOrMeta+a");
        await heading.pressSequentially(newTitle);
        await heading.blur();
        await titleUpdate;
        await titleGet;

        await openDashboardInfoSidebar(page);

        const description = sidesheet(page).getByPlaceholder(
          "Add description",
          { exact: true },
        );
        const descriptionUpdate = waitForDashboardUpdate(page, dashboardId);
        const descriptionGet = waitForDashboardGet(page, dashboardId);
        await description.click();
        await description.pressSequentially(newDescription);
        await description.blur();
        await descriptionUpdate;
        await descriptionGet;

        // New title and description should be preserved upon page reload
        const reloadGet = waitForDashboardGet(page, dashboardId);
        await page.reload();
        await reloadGet;

        await expect(heading).toHaveValue(newTitle);
        await openDashboardInfoSidebar(page);
        await expect(
          sidesheet(page).getByText(newDescription, { exact: true }),
        ).toBeVisible();
        await closeDashboardInfoSidebar(page);

        // should not call unnecessary API requests (metabase#31721)
        expect(updateCount()).toBe(2);

        // Should revert the title change if escaped
        await heading.click();
        await heading.pressSequentially("Whatever");
        await heading.press("Escape");
        await expect(heading).toHaveValue(newTitle);
        expect(updateCount()).toBe(2);

        // Should revert the description change if escaped
        await openDashboardInfoSidebar(page);
        const sheet = sidesheet(page);
        await sheet.getByText(newDescription, { exact: true }).click();
        await page.keyboard.type("Baz");
        await page.keyboard.press("Escape");
        await expect(
          sheet.getByText(newDescription, { exact: true }),
        ).toBeVisible();
        expect(updateCount()).toBe(2);
      });

      test("should update the name and description in the dashboard edit mode", async ({
        page,
      }) => {
        const updateCount = countDashboardUpdates(page);
        const heading = page.getByTestId("dashboard-name-heading");

        await editDashboard(page);

        // Should revert the title change if editing is cancelled
        await heading.click();
        await page.keyboard.press("ControlOrMeta+a");
        await heading.pressSequentially(newTitle);
        await heading.blur();
        await editBar(page)
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await modal(page)
          .getByRole("button", { name: "Discard changes", exact: true })
          .click();
        await expect(editBar(page)).not.toBeVisible();
        expect(updateCount()).toBe(0);
        await expect(heading).toHaveValue(originalDashboardName);

        await editDashboard(page);

        // should not take you out of the edit mode when updating title
        await heading.click();
        await page.keyboard.press("ControlOrMeta+a");
        await heading.pressSequentially(newTitle);
        await heading.blur();

        // The only way to open a sidebar in edit mode is to click on a
        // revision history
        await dashboardHeader(page)
          .getByText(/^Edited a few seconds ago/)
          .click();

        const description = sidesheet(page).getByPlaceholder(
          "Add description",
          { exact: true },
        );
        // TODO
        // This might be a bug! We're applying the description while still in
        // the edit mode! OTOH, the title is preserved only on save.
        const descriptionUpdate = waitForDashboardUpdate(page, dashboardId);
        await description.click();
        await description.pressSequentially(newDescription);
        await description.blur();
        await descriptionUpdate;
        await closeDashboardInfoSidebar(page);

        await saveDashboard(page);
        expect(updateCount()).toBe(2);
      });

      test("should not have markdown content overflow the description area (metabase#31326)", async ({
        page,
      }) => {
        await openDashboardInfoSidebar(page);

        const testMarkdownContent =
          "# Heading 1\n\n**bold** https://www.metabase.com/community_posts/how-to-measure-the-success-of-new-product-features-and-why-it-is-important\n\n![alt](/app/assets/img/welcome-modal-2.png)\n\nThis is my description. ";

        const description = sidesheet(page).getByPlaceholder(
          "Add description",
          { exact: true },
        );
        const update = waitForDashboardUpdate(page, dashboardId);
        await description.click();
        await page.keyboard.type(testMarkdownContent);
        await description.blur();
        await update;

        const markdown = sidesheet(page).getByTestId("editable-text");

        // Markdown content should not be bigger than its container
        const overflow = await markdown.evaluate((el) => {
          const parentRect = el.getBoundingClientRect();
          return {
            clientHeight: el.clientHeight,
            firstChildHeight: el.firstElementChild?.clientHeight ?? 0,
            childrenWithinBounds: Array.from(el.querySelectorAll("*")).every(
              (childEl) => {
                const childRect = childEl.getBoundingClientRect();
                return (
                  parentRect.left <= childRect.left &&
                  parentRect.right >= childRect.right
                );
              },
            ),
          };
        });
        expect(overflow.clientHeight).toBeGreaterThanOrEqual(
          overflow.firstChildHeight,
        );
        expect(overflow.childrenWithinBounds).toBe(true);

        // Textarea should have a proper height when we change markdown text
        await markdown.click();
        const { scrollHeight, minHeight } = await markdown.evaluate(
          (el, lines) => ({
            scrollHeight: el.scrollHeight,
            minHeight:
              lines * parseFloat(window.getComputedStyle(el).lineHeight),
          }),
          testMarkdownContent.split("\n").length,
        );
        expect(scrollHeight).toBeGreaterThanOrEqual(minHeight);
      });

      test("should prevent entering a title longer than 254 chars", async ({
        page,
      }) => {
        const longTitle = "A".repeat(256);
        const heading = page.getByTestId("dashboard-name-heading");
        await heading.click();
        await page.keyboard.press("ControlOrMeta+a");
        await heading.pressSequentially(longTitle);
        await heading.blur();
        await expect
          .poll(async () => (await heading.inputValue()).length)
          .toBe(254);
      });
    });

    test("should not allow dashboard editing on small screens", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 480, height: 800 });
      await expect(page.getByLabel("Edit dashboard")).not.toBeVisible();

      await page.setViewportSize({ width: 660, height: 800 });

      const editButton = page.getByLabel("Edit dashboard");
      await expect(editButton).toBeVisible();
      await editButton.click();
      await expect(
        editBar(page).getByText("You're editing this dashboard.", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("shows sorted cards on mobile screens", async ({ page, mb }) => {
      await page.setViewportSize({ width: 400, height: 800 });

      const { id: mobileDashboardId } = await mb.api.createDashboard();
      const cards = [
        // the bottom card intentionally goes first to have unsorted cards
        // coming from the BE
        getTextCardDetails({ row: 1, size_x: 24, size_y: 1, text: "bottom" }),
        getTextCardDetails({ row: 0, size_x: 24, size_y: 1, text: "top" }),
      ];
      await updateDashboardCards(mb.api, {
        dashboard_id: mobileDashboardId,
        cards,
      });
      await visitDashboard(page, mb.api, mobileDashboardId);

      await expect(getDashboardCard(page, 0)).toContainText("top");
      await expect(getDashboardCard(page, 1)).toContainText("bottom");
    });

    test("should not save the dashboard when the user clicks 'Discard changes'", async ({
      page,
    }) => {
      // Navigate to the dashboard via client-side navigation (to trigger the
      // client-side "Discard changes" prompt)
      await page.goto("/");
      await page
        .getByTestId("main-navbar-root")
        .getByText("Our analytics", { exact: true })
        .click();
      await page
        .getByTestId("collection-table")
        .getByText(originalDashboardName, { exact: true })
        .click();

      // Make a change to the dashboard
      await editDashboard(page);
      await page
        .getByTestId("dashboard-empty-state")
        .getByText("Add a chart", { exact: true })
        .click();
      await sidebar(page).getByText("Orders, Count", { exact: true }).click();
      await expect(getDashboardCards(page)).toHaveCount(1);

      // Navigate back and discard changes
      await page.goBack();
      await modal(page)
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      await page
        .getByTestId("collection-table")
        .getByText(originalDashboardName, { exact: true })
        .click();

      // Verify changes were not saved
      await expect(page.getByTestId("dashboard-empty-state")).toBeVisible();
    });
  });

  test.describe("iframe cards", () => {
    test("should handle various iframe and URL inputs", async ({
      page,
      mb,
    }) => {
      const testCases = [
        {
          input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        },
        {
          input: "https://youtu.be/dQw4w9WgXcQ",
          expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        },
        {
          input: "https://www.loom.com/share/1234567890abcdef",
          expected: "https://www.loom.com/embed/1234567890abcdef",
        },
        {
          input: "https://vimeo.com/123456789",
          expected: "https://player.vimeo.com/video/123456789",
        },
        { input: "example.com", expected: "https://example.com" },
        { input: "https://example.com", expected: "https://example.com" },
        {
          input:
            '<iframe src="https://example.com" onload="alert(\'XSS\')"></iframe>',
          expected: "https://example.com",
        },
      ];

      await mb.api.updateSetting("allowed-iframe-hosts", "*");

      const { id } = await mb.api.createDashboard();
      await visitDashboard(page, mb.api, id);

      await editDashboard(page);

      for (const [index, { input, expected }] of testCases.entries()) {
        await addIFrameWhileEditing(page, input);
        await page.getByRole("button", { name: "Done", exact: true }).click();
        await validateIFrame(page, expected, index);
      }
    });

    test("should respect allowed-iframe-hosts setting", async ({
      page,
      mb,
    }) => {
      const errorMessage = /can not be embedded in iframe cards/;

      await mb.api.updateSetting(
        "allowed-iframe-hosts",
        ["youtube.com", "player.videos.com"].join("\n"),
      );

      const { id } = await mb.api.createDashboard();
      await visitDashboard(page, mb.api, id);
      await editDashboard(page);

      const doneButton = page.getByRole("button", {
        name: "Done",
        exact: true,
      });

      // Test allowed domain with subdomains
      await addIFrameWhileEditing(
        page,
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
      );
      await doneButton.click();
      await validateIFrame(page, "https://www.youtube.com/embed/dQw4w9WgXcQ");

      await editIFrameWhileEditing(
        page,
        0,
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
      await doneButton.click();
      await validateIFrame(page, "https://www.youtube.com/embed/dQw4w9WgXcQ");

      // Test allowed subdomain, but no other domains
      await editIFrameWhileEditing(
        page,
        0,
        "player.videos.com/video/123456789",
      );
      await doneButton.click();
      await validateIFrame(page, "https://player.videos.com/video/123456789");

      const assertIframeRejected = async () => {
        const card = getDashboardCard(page);
        await expect(card.getByText(errorMessage)).toBeVisible();
        await expect(card.locator("iframe")).toHaveCount(0);
      };

      await editIFrameWhileEditing(page, 0, "videos.com/video/123456789");
      await doneButton.click();
      await assertIframeRejected();

      await editIFrameWhileEditing(page, 0, "www.videos.com/video");
      await doneButton.click();
      await assertIframeRejected();

      // Test forbidden domain and subdomains
      await editIFrameWhileEditing(page, 0, "https://example.com");
      await doneButton.click();
      await assertIframeRejected();

      await editIFrameWhileEditing(page, 0, "www.example.com");
      await doneButton.click();
      await assertIframeRejected();
    });
  });

  test("should add a filter", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    // Adding location/state doesn't make much sense for this case,
    // but we're testing just that the filter is added to the dashboard
    await setFilter(page, "Location", "Is");

    await getDashboardCard(page).getByText("Select…", { exact: true }).click();

    await popover(page).getByText("State", { exact: true }).click();

    await expect(icon(page, "close").first()).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await saveDashboard(page);

    // Assert that the selected filter is present in the dashboard
    await expect(page.getByText(/location/i).first()).toBeVisible();
  });

  test("should link filters to custom question with filtered aggregate data (metabase#11007)", async ({
    page,
    mb,
  }) => {
    // programmatically create and save a question as per repro instructions
    // in #11007
    await mb.api.post("/api/card", {
      name: "11007",
      dataset_query: {
        database: SAMPLE_DB_ID,
        filter: [">", ["field", "sum", { "base-type": "type/Float" }], 100],
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
          filter: ["=", ["field", ORDERS.USER_ID, null], 1],
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    });

    await mb.api.createDashboard({ name: "dash:11007" });

    await page.goto("/collection/root");
    // enter newly created dashboard
    await page.getByText("dash:11007", { exact: true }).click();
    await expect(
      page.getByText("This dashboard is empty", { exact: true }),
    ).toBeVisible();
    // add previously created question to it
    await page.getByLabel("Edit dashboard").click();
    await openQuestionsSidebar(page);
    await page.getByText("11007", { exact: true }).click();

    await setFilter(page, "Date picker", "All Options");

    // and connect it to the card
    await selectDashboardFilter(
      page.getByTestId("dashcard-container"),
      "Created At",
    );

    // add second filter
    await setFilter(page, "ID");

    // and connect it to the card
    await selectDashboardFilter(
      page.getByTestId("dashcard-container"),
      "Product ID",
    );

    // add third filter
    await setFilter(page, "Text or Category", "Starts with");
    // and connect it to the card
    await selectDashboardFilter(
      page.getByTestId("dashcard-container"),
      "Category",
    );

    await saveDashboard(page);
    await expect(
      page.getByText("You're editing this dashboard.", { exact: true }),
    ).toHaveCount(0);
  });

  test("should update a dashboard filter by clicking on a map pin (metabase#13597)", async ({
    page,
    mb,
  }) => {
    const { id: questionId } = await mb.api.createQuestion({
      name: "13597",
      query: { "source-table": PEOPLE_ID, limit: 2 },
      display: "map",
    });
    const { id: dashboardId } = await mb.api.createDashboard();

    // add filter (ID) to the dashboard
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      parameters: [
        { id: "92eb69ea", name: "ID", sectionId: "id", slug: "id", type: "id" },
      ],
    });

    await addOrUpdateDashboardCard(mb.api, {
      card_id: questionId,
      dashboard_id: dashboardId,
      card: {
        parameter_mappings: [
          {
            parameter_id: "92eb69ea",
            card_id: questionId,
            target: ["dimension", ["field", PEOPLE.ID, null]],
          },
        ],
        visualization_settings: {
          // set click behavior to update filter (ID)
          click_behavior: {
            type: "crossfilter",
            parameterMapping: {
              "92eb69ea": {
                id: "92eb69ea",
                source: { id: "ID", name: "ID", type: "column" },
                target: { id: "92eb69ea", type: "parameter" },
              },
            },
          },
        },
      },
    });

    await visitDashboard(page, mb.api, dashboardId);
    // dispatchEvent, not a coordinate click: leaflet animates the initial
    // pan/zoom, so a real-coordinate click (even forced) can land off the
    // marker; Cypress' {force: true} dispatches on the element regardless.
    await mapPinIcon(page).first().dispatchEvent("click");
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${dashboardId}\\?id=1`),
    );
    await expect(page.getByText(/Hudson Borer - 1/).first()).toBeVisible();
  });

  test("should display column options for cross-filter (metabase#14473)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "14473",
      native: { query: "SELECT COUNT(*) FROM PRODUCTS", "template-tags": {} },
    };

    const { dashboardId } = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails,
    });

    // Add 4 filters to the dashboard
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      parameters: [
        { name: "ID", slug: "id", id: "729b6456", type: "id" },
        { name: "ID 1", slug: "id_1", id: "bb20f59e", type: "id" },
        {
          name: "Category",
          slug: "category",
          id: "89873480",
          type: "category",
        },
        {
          name: "Category 1",
          slug: "category_1",
          id: "cbc045f2",
          type: "category",
        },
      ],
    });

    await visitDashboard(page, mb.api, dashboardId);

    // Add cross-filter click behavior manually
    await icon(page, "pencil").click();
    await getDashboardCard(page).hover();
    await icon(
      getDashboardCard(page).getByTestId("dashboardcard-actions-panel"),
      "click",
    ).click();
    await page.getByText("COUNT(*)", { exact: true }).click();
    await page.getByText("Update a dashboard filter", { exact: true }).click();

    await checkOptionsForFilter(page, "ID");
    await checkOptionsForFilter(page, "Category");
  });

  test("should not get the parameter values from the field API", async ({
    page,
    mb,
  }) => {
    // In this test we're using already present dashboard
    // ("Orders in a dashboard")
    const FILTER_ID = "d7988e02";

    // Add filter to the dashboard
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [
        { id: FILTER_ID, name: "Category", slug: "category", type: "category" },
      ],
    });

    // Connect filter to the existing card
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    let dashboardParamsCalls = 0;
    let fieldCalls = 0;
    let fieldValuesCalls = 0;
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (
        pathname ===
        `/api/dashboard/${ORDERS_DASHBOARD_ID}/params/${FILTER_ID}/values`
      ) {
        dashboardParamsCalls++;
      }
      if (pathname === `/api/field/${PRODUCTS.CATEGORY}`) {
        fieldCalls++;
      }
      if (pathname === `/api/field/${PRODUCTS.CATEGORY}/values`) {
        fieldValuesCalls++;
      }
    });

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await filterWidget(page).click();

    for (const category of ["Doohickey", "Gadget", "Gizmo", "Widget"]) {
      await expect(page.getByText(category, { exact: true })).toBeVisible();
    }

    await expect.poll(() => dashboardParamsCalls).toBe(1);
    expect(fieldCalls).toBe(0);
    expect(fieldValuesCalls).toBe(0);
  });

  test("should be possible to visit a dashboard with click-behavior linked to the dashboard without permissions (metabase#15368)", async ({
    page,
    mb,
  }) => {
    const { personal_collection_id } = (await (
      await mb.api.get("/api/user/current")
    ).json()) as { personal_collection_id: number };

    // Save new dashboard in admin's personal collection
    await mb.api
      .post("/api/dashboard", {
        name: "15368D",
        collection_id: personal_collection_id,
      })
      .then(async (response) => {
        const { id: NEW_DASHBOARD_ID } = (await response.json()) as {
          id: number;
        };
        const COLUMN_REF = `["ref",["field-id",${ORDERS.ID}]]`;
        // Add click behavior to the existing "Orders in a dashboard" dashboard
        await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
          dashcards: [
            {
              id: ORDERS_DASHBOARD_DASHCARD_ID,
              card_id: ORDERS_QUESTION_ID,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 8,
              series: [],
              visualization_settings: {
                column_settings: {
                  [COLUMN_REF]: {
                    click_behavior: {
                      type: "link",
                      linkType: "dashboard",
                      parameterMapping: {},
                      targetId: NEW_DASHBOARD_ID,
                    },
                  },
                },
              },
              parameter_mappings: [],
            },
          ],
        });
      });

    await mb.signInAsNormalUser();
    const queryMetadata = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        `/api/dashboard/${ORDERS_DASHBOARD_ID}/query_metadata`,
    );
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await queryMetadata;

    await expect(
      page.getByText("Orders in a dashboard", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/37\.65/).first()).toBeVisible();
  });

  test("should be possible to scroll vertically after fullscreen layer is closed (metabase#15596)", async ({
    page,
    mb,
  }) => {
    // Make this dashboard card extremely tall so that it spans outside of
    // visible viewport
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 20,
          series: [],
          visualization_settings: {},
          parameter_mappings: [],
        },
      ],
    });

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await expect(page.getByText(/37\.65/).first()).toBeVisible();
    await assertScrollBarExists(page);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: ORDERS_DASHBOARD_ID,
    });

    await icon(modal(page), "close").click();
    await expect(modal(page)).toHaveCount(0);
    await assertScrollBarExists(page);
  });

  // ~60% failure rate on a quiet box (3 fail / 2 pass over 5 runs), and the
  // instability looks app-side: DashCard.tsx scrolls once in useMount and
  // clears the scrollTo hash on request, so any later remount/reflow loses the
  // scroll with nothing to re-trigger it. Fixme'd rather than stabilized: the
  // assertion (toBeInViewport) is deliberately stronger than the Cypress
  // original's should("be.visible"), which ignores scroll position entirely, so
  // weakening it or wrapping it in toPass would mask the exact behaviour under
  // test. Not claimed as a product bug — the fidelity cross-check bar isn't met
  // (Cypress fails here too, but under Electron and against a weaker assertion;
  // needs a --browser chrome re-run). See findings-inbox/dashboard-core.md.
  test.fixme(
    "should support auto-scrolling to a dashcard via a url hash param",
    async ({ page, mb }) => {
      const questionCard = {
        id: ORDERS_DASHBOARD_DASHCARD_ID,
        card_id: ORDERS_QUESTION_ID,
        row: 0,
        col: 0,
        size_x: 16,
        size_y: 9,
      };
      const paddingCard = getTextCardDetails({
        col: 0,
        text: "I'm just padding",
      });
      const TARGET_TEXT = "Scroll to me plz.";
      const targetCard = getTextCardDetails({ col: 0, text: TARGET_TEXT });
      const dashcards = [questionCard, paddingCard, targetCard];

      const dashboard = await createDashboardWithCards(mb.api, {
        name: "Auto-scroll test",
        dashcards,
      });
      const target = dashboard.dashcards.find(
        (dashcard) => dashcard.visualization_settings?.text === TARGET_TEXT,
      );
      expect(target).toBeTruthy();

      // should not be visible (below the fold)
      await page.goto(`/dashboard/${dashboard.id}`);
      await expect(
        page.getByText(TARGET_TEXT, { exact: true }),
      ).not.toBeInViewport();

      // should scroll into view w/ scrollTo hash param.
      // Blank first: a hash-only goto is a same-document navigation, and the
      // scroll runs in DashCard's mount effect only. (The Cypress first visit
      // URL had a stray "}", which made its second visit a full load.)
      await page.goto("about:blank");
      await page.goto(`/dashboard/${dashboard.id}#scrollTo=${target?.id}`);
      // wait for scroll to complete (hash cleared) then verify visibility
      await expect
        .poll(() => new URL(page.url()).hash)
        .not.toContain("scrollTo");
      await expect(
        page.getByText(TARGET_TEXT, { exact: true }),
      ).toBeInViewport();
    },
  );

  test("should allow making card hide when it is empty", async ({
    page,
    mb,
  }) => {
    const FILTER_ID = "d7988e02";

    // Add filter to the dashboard
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [{ id: FILTER_ID, name: "ID", slug: "id", type: "id" }],
    });

    // Connect filter to the existing card
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: ORDERS_QUESTION_ID,
              target: ["dimension", ["field", ORDERS.ID]],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await getDashboardCard(page).hover();
    await icon(
      getDashboardCard(page).getByTestId("dashboardcard-actions-panel"),
      "palette",
    ).click({ force: true });

    const dialog = modal(page);
    await dialog
      .getByRole("switch", { name: "Hide this card if there are no results" })
      .click({ force: true });
    await dialog.getByRole("button", { name: "Done", exact: true }).click();

    await saveDashboard(page);

    // Verify the card is hidden when the value is correct but produces empty
    // results
    await filterWidget(page).click();
    const paramPopover = dashboardParametersPopover(page);
    const idInput = paramPopover.getByPlaceholder("Enter an ID", {
      exact: true,
    });
    await idInput.pressSequentially("-1");
    await idInput.press("Enter");
    await paramPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(page.getByTestId("dashcard")).toHaveCount(0);

    // Verify it becomes visible once the filter is cleared
    await icon(filterWidget(page), "close").click();

    await expect(
      page.getByTestId("dashcard").getByText("Orders", { exact: true }),
    ).toBeVisible();
  });

  test.describe("warn before leave", () => {
    async function createNewDashboard(page: Page) {
      await newButton(page).click();
      await popover(page).getByText("Dashboard", { exact: true }).click();
      const dialog = modal(page);
      await dialog.getByLabel("Name", { exact: true }).fill("Test");
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
    }

    async function assertPreventLeave(
      page: Page,
      options: { openSidebar: boolean } = { openSidebar: true },
    ) {
      if (options.openSidebar) {
        await openQuestionsSidebar(page);
      }
      await page.getByText("New Question", { exact: true }).click();
      const dialog = modal(page);
      await expect(
        dialog.getByText("Save your changes?", { exact: true }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    }

    test("should warn a user before leaving after adding, editing, or removing a card on a dashboard", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(page.getByTestId("home-page")).toContainText(
        "Try out these sample x-rays to see what Metabase can do.",
      );

      // add
      await createNewDashboard(page);
      const queryMetadata = page.waitForResponse((response) =>
        /^\/api\/card\/\d+\/query_metadata$/.test(
          new URL(response.url()).pathname,
        ),
      );
      await icon(dashboardHeader(page), "add").click();
      await page
        .getByTestId("add-card-sidebar")
        .getByText("Orders", { exact: true })
        .click();
      await queryMetadata;
      await assertPreventLeave(page, { openSidebar: false });
      await saveDashboard(page);

      // edit
      await editDashboard(page);
      await dragOnXAxis(page.getByTestId("dashcard-container").first(), 100);
      await assertPreventLeave(page);
      await saveDashboard(page);

      // remove
      await editDashboard(page);
      await removeDashboardCard(page);
      await assertPreventLeave(page);
    });

    test("should warn a user before leaving after adding, removing, moving, or duplicating a tab", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      // add tab
      await createNewDashboard(page);
      await createNewTab(page);
      await assertPreventLeave(page);
      await saveDashboard(page);

      // move tab
      await editDashboard(page);
      await dragOnXAxis(
        page.getByRole("tab", { name: "Tab 2", exact: true }),
        -200,
      );
      // assert tab order is now correct and ui has caught up to result of
      // dragging the tab
      await expect(page.getByRole("tab").nth(0)).toHaveText("Tab 2");
      await expect(page.getByRole("tab").nth(1)).toHaveText("Tab 1");

      await page.waitForTimeout(1000);
      await assertPreventLeave(page);
      await saveDashboard(page);

      // duplicate tab
      await editDashboard(page);
      await duplicateTab(page, "Tab 1");
      await assertPreventLeave(page);
      await saveDashboard(page);

      await expect(
        page.getByRole("tab", { name: "Copy of Tab 1", exact: true }),
      ).toHaveAttribute("aria-selected", "true");

      // remove tab
      await editDashboard(page);
      await deleteTab(page, "Copy of Tab 1");
      // url is changed after removing the tab
      // can be a side effect
      await expect(page).toHaveURL(/tab-1/);
      await assertPreventLeave(page);
      await saveDashboard(page);

      // rename tab
      await editDashboard(page);
      await renameTab(page, "Tab 2", "Foo tab");
      await assertPreventLeave(page);
    });
  });
});

test.describe("scenarios > dashboard", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow();
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("should be possible to add an iframe card", async ({ page, mb }) => {
    await mb.api.updateSetting("allowed-iframe-hosts", "*");
    const { id } = await mb.api.createDashboard({ name: "iframe card" });
    await visitDashboard(page, mb.api, id);

    await editDashboard(page);
    await addIFrameWhileEditing(page, "https://example.com");
    await expect(page.getByTestId("dashboardcard-actions-panel")).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await getDashboardCard(page, 0).hover();
    await expect(page.getByTestId("dashboardcard-actions-panel")).toBeVisible();
    await validateIFrame(page, "https://example.com");
    await saveDashboard(page);
    await validateIFrame(page, "https://example.com");

    await expectUnstructuredSnowplowEvent({
      event: "new_iframe_card_created",
      target_id: id,
      event_detail: "example.com",
    });
  });

  test("saving a dashboard should track a 'dashboard_saved' snowplow event", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    const newTitle = "New title";
    const heading = page.getByTestId("dashboard-name-heading");
    await heading.click();
    await page.keyboard.press("ControlOrMeta+a");
    await heading.pressSequentially(newTitle);
    await heading.blur();
    await saveDashboard(page);
    await expectUnstructuredSnowplowEvent({ event: "dashboard_saved" });
  });

  test("should allow users to add link cards to dashboards", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    const recentViews = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/activity/recents",
    );
    await page.getByLabel("Add a link or iframe").click();
    await popover(page).getByText("Link", { exact: true }).click();

    await recentViews;

    await page
      .getByTestId("custom-edit-text-link")
      .getByPlaceholder("https://example.com", { exact: true })
      .pressSequentially("Orders");

    const searchResults = popover(page);
    await expect(searchResults.getByText(/Loading/i)).toHaveCount(0);
    await searchResults
      .getByText("Orders in a dashboard", { exact: true })
      .click();

    await expect(
      page
        .getByTestId("entity-edit-display-link")
        .getByText(/orders in a dashboard/i),
    ).toBeVisible();

    await saveDashboard(page);

    await expect(
      page
        .getByTestId("entity-view-display-link")
        .getByText(/orders in a dashboard/i),
    ).toBeVisible();

    await expectUnstructuredSnowplowEvent({ event: "new_link_card_created" });
  });

  test("should track enabling the hide empty cards setting", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await getDashboardCard(page).hover();
    await icon(
      getDashboardCard(page).getByTestId("dashboardcard-actions-panel"),
      "palette",
    ).click({ force: true });

    const switchInput = modal(page).getByRole("switch", {
      name: "Hide this card if there are no results",
    });
    await switchInput.click({ force: true }); // enable
    await switchInput.click({ force: true }); // disable
    await switchInput.click({ force: true }); // enable

    await expectUnstructuredSnowplowEvent(
      {
        event: "card_set_to_hide_when_no_results",
        dashboard_id: ORDERS_DASHBOARD_ID,
      },
      2,
    );
  });

  test("should allow the creator to change the dashboard width to 'fixed' or 'full'", async ({
    page,
    mb,
  }) => {
    const TAB_1 = { id: 1, name: "Tab 1" };
    const TAB_2 = { id: 2, name: "Tab 2" };
    const DASHBOARD_TEXT_FILTER = {
      id: "94f9e513",
      name: "Text filter",
      slug: "filter-text",
      type: "string/contains",
    };

    const dashboard = await createDashboardWithTabs(mb.api, {
      tabs: [TAB_1, TAB_2],
      parameters: [{ ...DASHBOARD_TEXT_FILTER, default: "Example Input" }],
      dashcards: [
        mockVirtualDashCard({
          id: -1,
          dashboard_tab_id: TAB_1.id,
          size_x: GRID_WIDTH,
          parameter_mappings: [
            { parameter_id: "94f9e513", target: ["text-tag", "Name"] },
          ],
          card: mockVirtualCard({ display: "text" }),
          visualization_settings: { text: "Top: {{Name}}" },
        }),
        mockVirtualDashCard({
          id: -2,
          size_x: GRID_WIDTH,
          dashboard_tab_id: TAB_1.id,
          card: mockVirtualCard({ display: "text" }),
          visualization_settings: { text: "Bottom" },
        }),
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    // new dashboards should default to 'fixed' width
    await assertDashboardFixedWidth(page);

    // toggle full-width
    await editDashboard(page);
    await page.getByLabel("Toggle width").click();
    await popover(page).getByLabel("Full width").click();
    await assertDashboardFullWidth(page);
    await expectUnstructuredSnowplowEvent({
      event: "dashboard_width_toggled",
      full_width: true,
    });

    // confirm it saves the state after saving and refreshing
    await saveDashboard(page);
    await page.reload();
    await assertDashboardFullWidth(page);

    // toggle back to fixed
    await editDashboard(page);
    await page.getByLabel("Toggle width").click();
    await popover(page).getByLabel("Full width").click();
    await assertDashboardFixedWidth(page);
    await expectUnstructuredSnowplowEvent({
      event: "dashboard_width_toggled",
      full_width: false,
    });
  });

  test("should track reverting to an old version", async ({ page, mb }) => {
    const { id } = await mb.api.createDashboard({ name: "Foo" });
    await mb.api.put(`/api/dashboard/${id}`, { name: "Bar" });
    await visitDashboard(page, mb.api, id);

    const revisionHistory = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/revision",
    );

    const moreInfoButton = dashboardHeader(page).getByLabel("More info");
    await expect(moreInfoButton).toBeVisible();
    await moreInfoButton.click();

    const sheet = sidesheet(page);
    await sheet.getByRole("tab", { name: "History", exact: true }).click();
    await revisionHistory;
    await expect(sheet.getByTestId("dashboard-history-list")).toBeVisible();
    // Await the (real) revert so the refreshed revision list is settled
    // before the stubbed second revert below.
    const firstRevert = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/revision/revert",
    );
    await sheet.getByTestId("question-revert-button").click();
    await firstRevert;

    await expectUnstructuredSnowplowEvent({
      event: "revert_version_clicked",
      event_detail: "dashboard",
    });

    // Simulate a backend failure on revert and confirm we surface
    // the error message as a toast (UXW-310).
    await page.route("**/api/revision/revert", (route) =>
      route.fulfill({
        status: 500,
        json: { message: "Cannot revert: missing dashboard" },
      }),
    );

    const failedRevert = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/revision/revert",
    );
    await sheet.getByTestId("question-revert-button").first().click();
    await failedRevert;

    await expect(undoToast(page)).toContainText(
      "Cannot revert: missing dashboard",
    );
  });
});

test.describe("LOCAL TESTING ONLY > dashboard", () => {
  /**
   * WARNING:
   *    https://github.com/metabase/metabase/issues/15656
   *    - We are currently not able to test translations in CI
   *    - DO NOT unskip this test even after the issue is fixed
   *    - To be used for local testing only
   *    - Make sure you have translation resources built first.
   *        - Run `./bin/i18n/build-translation-resources`
   *        - Then start the server and Cypress tests
   */
  test("dashboard filter should not show placeholder for translated languages (metabase#15694)", async ({
    page,
    mb,
  }) => {
    test.skip(true, "Local-only translation test — tagged @skip upstream");

    await mb.restore();
    await mb.signInAsAdmin();

    const { id: USER_ID } = (await (
      await mb.api.get("/api/user/current")
    ).json()) as { id: number };
    await mb.api.put(`/api/user/${USER_ID}`, { locale: "fr" });

    const { questionId, dashboardId } = await mb.api.createQuestionAndDashboard(
      {
        questionDetails: {
          name: "15694",
          query: { "source-table": PEOPLE_ID },
        },
      },
    );
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      parameters: [
        {
          name: "Location",
          slug: "location",
          id: "5aefc725",
          type: "string/=",
          sectionId: "location",
        },
      ],
    });
    await addOrUpdateDashboardCard(mb.api, {
      card_id: questionId,
      dashboard_id: dashboardId,
      card: {
        parameter_mappings: [
          {
            parameter_id: "5aefc725",
            card_id: questionId,
            target: ["dimension", ["field", PEOPLE.STATE, null]],
          },
        ],
      },
    });

    await page.goto(`/dashboard/${dashboardId}?location=AK&location=CA`);
    await expect(filterWidget(page).getByText(/\{0\}/)).toHaveCount(0);
  });
});

test.describe("scenarios > dashboard > permissions", () => {
  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    // This first test creates a dashboard with two questions.
    // One is in Our Analytics the other is in a more locked down collection.
    await mb.signInAsAdmin();

    // The setup is a bunch of nested API calls to create the questions,
    // dashboard, dashcards, collections and link them all up together.
    const { id: collection_id } = await createCollection(mb.api, {
      name: "locked down collection",
      parent_id: null,
    });

    const graph = (await (
      await mb.api.get("/api/collection/graph")
    ).json()) as {
      revision: number;
      groups: Record<string, Record<string, string>>;
    };
    // update the perms for the just-created collection
    await mb.api.put("/api/collection/graph", {
      revision: graph.revision,
      groups: Object.fromEntries(
        Object.entries(graph.groups).map(([groupId, groupPerms]) => [
          groupId,
          {
            ...groupPerms,
            // 2 is admins, so leave that as "write"
            [collection_id]: groupId === "2" ? "write" : "none",
          },
        ]),
      ),
    });

    const firstQuestion = (await (
      await mb.api.post("/api/card", {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "native",
          native: { query: "select 'foo'" },
        },
        display: "table",
        visualization_settings: {},
        name: "First Question",
        collection_id,
      })
    ).json()) as { id: number };

    const secondQuestion = (await (
      await mb.api.post("/api/card", {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "native",
          native: { query: "select 'bar'" },
        },
        display: "table",
        visualization_settings: {},
        name: "Second Question",
        collection_id: null,
      })
    ).json()) as { id: number };

    const { id: dashId } = await mb.api.createDashboard();
    dashboardId = dashId;

    await updateDashboardCards(mb.api, {
      dashboard_id: dashId,
      cards: [
        { card_id: firstQuestion.id, row: 0, col: 0, size_x: 8, size_y: 6 },
        { card_id: secondQuestion.id, row: 0, col: 6, size_x: 8, size_y: 6 },
      ],
    });
  });

  test("should let admins view all cards in a dashboard", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, dashboardId);
    // Admin can see both questions
    await expect(
      page.getByText("First Question", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("foo", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Second Question", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("bar", { exact: true })).toBeVisible();
  });

  test("should display dashboards with some cards locked down", async ({
    page,
    mb,
  }) => {
    await mb.signIn("nodata");
    await visitDashboard(page, mb.api, dashboardId);
    await expect(
      page.getByText("Sorry, you don't have permission to see this card.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Second Question", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("bar", { exact: true })).toBeVisible();
  });

  test("should display an error if they don't have perms for the dashboard", async ({
    page,
    mb,
  }) => {
    await mb.signIn(cachedUserName("nocollection"));
    await visitDashboard(page, mb.api, dashboardId);
    await expect(
      page.getByText("Sorry, you don’t have permission to see that.", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("scenarios > dashboard > entity id support", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("when loading `/dashboard/entity/${entity_id}`, it should redirect to `/dashboard/${id}` and display the dashboard correctly", async ({
    page,
  }) => {
    await page.goto(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}`);

    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}`),
    );

    // Making sure the dashboard loads
    await expect(
      main(page).getByText("Orders in a dashboard", { exact: true }),
    ).toBeVisible();
  });

  test("when loading `/dashboard/entity/${entity_id}?tab=${tab_entity_id}`, it should redirect to `/dashboard/${id}?tab=${tab_id}` and select the correct tab", async ({
    page,
    mb,
  }) => {
    const dashboard = await createDashboardWithTabs(mb.api, {
      tabs: [
        { name: "Tab 1", id: -1 },
        { name: "Tab 2", id: -2 },
      ],
      dashcards: [],
    });

    await page.goto(
      `/dashboard/entity/${dashboard.entity_id}?tab=${dashboard.tabs[1].entity_id}`,
    );

    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${dashboard.id}\\?tab=${dashboard.tabs[1].id}`),
    );

    await expect(
      main(page).getByRole("tab", { name: "Tab 2", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("it should preserve search params such as filters when redirecting", async ({
    page,
    mb,
  }) => {
    // Add filter to the dashboard
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [
        { id: "abc123", name: "Text", slug: "text", type: "string/=" },
      ],
    });

    // Connect filter to the existing card
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: "abc123",
              card_id: ORDERS_QUESTION_ID,
              target: ["dimension", ["field", ORDERS.ID, null]],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    // Visit the dashboard via the entity id path and verify that the filter
    // is preserved
    await page.goto(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}?text=123`);

    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}`),
    );
    await expect(page).toHaveURL(/text=123/);

    await expect(filterWidget(page)).toContainText("Text");
    await expect(filterWidget(page)).toContainText("123");
  });

  test("when loading `/dashboard/entity/${entity_id}/move`, it should redirect to `/dashboard/${id}/move` and show the move modal", async ({
    page,
  }) => {
    await page.goto(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}/move`);
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}/move`),
    );

    await expect(
      main(page).getByText("Orders in a dashboard", { exact: true }),
    ).toBeVisible();
    await expect(
      modal(page).getByText("Move dashboard to…", { exact: true }),
    ).toBeVisible();
  });

  test("when loading `/dashboard/entity/${non existing entity id}`, it should show a 404 page", async ({
    page,
  }) => {
    const nonExistingEntityId = "x".repeat(21);
    await page.goto(`/dashboard/entity/${nonExistingEntityId}`);

    await expect(
      main(page).getByText("We're a little lost...", { exact: true }),
    ).toBeVisible();
  });

  test("when loading `/dashboard/entity/${non existing entity id}`, it should show a 404 page even if the entity id starts with a number", async ({
    page,
  }) => {
    const nonExistingEntityId = "12".padEnd(21, "x");
    await page.goto(`/dashboard/entity/${nonExistingEntityId}`);

    await expect(
      main(page).getByText("We're a little lost...", { exact: true }),
    ).toBeVisible();
  });

  test("when loading `/dashboard/entity/${entity id}?tab=${non existing tab entity id}`, it should show a 404 page even if the entity id starts with a number", async ({
    page,
  }) => {
    const nonExistingEntityId = "12".padEnd(21, "x");
    await page.goto(
      `/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}?tab=${nonExistingEntityId}`,
    );

    await expect(
      main(page).getByText("We're a little lost...", { exact: true }),
    ).toBeVisible();
  });
});
