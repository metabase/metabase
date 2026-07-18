/**
 * Playwright port of e2e/test/scenarios/dashboard/tabs.cy.spec.js
 *
 * Port notes:
 * - Snowplow helpers are no-op stubs (no snowplow-micro container in the spike
 *   harness; port rule 6). The two snowplow tests keep their real UI actions —
 *   only the event assertions are neutered.
 * - cy.spy()/cy.intercept request-count assertions become page.on("request")
 *   counters (countRequests) keyed on the exact pathname the spy watched.
 * - view_count assertions use expect.poll: the backend's view_count increment
 *   can land a tick after the query response Cypress waited on. Verified the
 *   arithmetic: only card / dashcard / public-dashcard /query requests bump
 *   view_count — GET /api/card/:id (firstQuestion/secondQuestion) does NOT,
 *   despite a misleading "+1 (firstQuestion)" comment upstream.
 * - Tab reorder (#34970) is a dnd-kit sortable; ported with a real-mouse drag
 *   that clears the 10px activationConstraint (reorderTabToStart).
 * - assertFiltersVisibility: the Cypress original's forEach assertions were
 *   dead code (an arrow fn passed where cy.findByTestId expects options), so
 *   they never ran. The port restores their evident intent and enforces the
 *   per-tab visibility — a migration dividend (findings-inbox/dashboard-tabs.md).
 * - The embedded-tab test drives the /embed iframe via the support/embedding
 *   FrameLocator harness.
 */
import type { Page } from "@playwright/test";

import {
  editBar,
  editDashboard,
  filterWidget,
  getDashboardCard,
  modal,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
} from "../support/dashboard";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  createDashboardWithTabs,
  createNewTab,
  deleteTab,
  duplicateTab,
  getDashboardCards,
  getTextCardDetails,
  updateDashboardCards,
} from "../support/dashboard-core";
import {
  addHeadingWhileEditing,
  countRequests,
  moveDashCardToTab,
  mockQuestionDashboardCard,
  undo,
  waitForDashboardPut,
} from "../support/dashboard-parameters";
import { delayResponses } from "../support/dashboard-repros";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  DASHBOARD_DATE_FILTER,
  DASHBOARD_LOCATION_FILTER,
  DASHBOARD_NUMBER_FILTER,
  DASHBOARD_TEXT_FILTER,
  addLinkWhileEditing,
  assertFilterValues,
  assertFiltersVisibility,
  createNativeQuestionAndDashboardInCollections,
  createDateFilterMapping,
  createNumberFilterMapping,
  createTextFilterMapping,
  dashboardCards,
  reorderTabToStart,
  visitDashboardAndCreateTab,
} from "../support/dashboard-tabs";
import { getHeadingCardDetails, getLinkCardDetails } from "../support/click-behavior";
import { dashboardGrid } from "../support/drillthroughs";
import { openLegacyStaticEmbeddingModal, visitIframe } from "../support/embedding";
import { publishChanges } from "../support/embedding-dashboard";
import { test, expect } from "../support/fixtures";
import { openQuestionsSidebar } from "../support/revisions";
import { ORDERS_BY_YEAR_QUESTION_ID } from "../support/command-palette";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { main } from "../support/sharing";
import { goToTab, icon, popover, visitDashboard } from "../support/ui";

const TAB_1 = { id: 1, name: "Tab 1" };
const TAB_2 = { id: 2, name: "Tab 2" };

test.describe("scenarios > dashboard > tabs", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should only display cards on the selected tab", async ({ page, mb }) => {
    // Create new tab
    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    await expect(
      page.getByRole("heading", {
        name: "Create a new question or browse your collections for an existing one.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(dashboardGrid(page)).toHaveCount(0);

    // Add card to second tab
    await openQuestionsSidebar(page);
    await sidebar(page).getByText("Orders, Count", { exact: true }).click();

    // Anchor the card add before saving (dashboard must be dirty for the PUT).
    await expect(getDashboardCards(page)).toHaveCount(1);
    await saveDashboard(page);
    await expect(page).toHaveURL(/\d+-tab-2/); // id is not stable

    // Go back to first tab
    await goToTab(page, "Tab 1");
    await expect(
      dashboardCards(page).getByText("Orders, count", { exact: true }),
    ).toHaveCount(0);
    await expect(
      dashboardCards(page).getByText("Orders", { exact: true }),
    ).toBeVisible();
  });

  test("should only display filters mapped to cards on the selected tab", async ({
    page,
    mb,
  }) => {
    const dashboard = await createDashboardWithTabs(mb.api, {
      tabs: [TAB_1, TAB_2],
      parameters: [
        DASHBOARD_DATE_FILTER,
        { ...DASHBOARD_NUMBER_FILTER, default: 20 },
        { ...DASHBOARD_TEXT_FILTER, default: "fa" },
        DASHBOARD_LOCATION_FILTER,
      ],
      dashcards: [
        mockQuestionDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_1.id,
          parameter_mappings: [
            createDateFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            createTextFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
          ],
        }),
        mockQuestionDashboardCard({
          id: -2,
          card_id: ORDERS_BY_YEAR_QUESTION_ID,
          dashboard_tab_id: TAB_2.id,
          parameter_mappings: [
            createDateFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
            createNumberFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
          ],
        }),
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    await assertFiltersVisibility(page, {
      visible: [DASHBOARD_DATE_FILTER, DASHBOARD_TEXT_FILTER],
      hidden: [DASHBOARD_NUMBER_FILTER, DASHBOARD_LOCATION_FILTER],
    });

    await assertFilterValues(page, [
      [DASHBOARD_DATE_FILTER, undefined],
      [DASHBOARD_TEXT_FILTER, "fa"],
      [DASHBOARD_NUMBER_FILTER, 20],
      [DASHBOARD_LOCATION_FILTER, undefined],
    ]);

    await goToTab(page, TAB_2.name);

    await assertFiltersVisibility(page, {
      visible: [DASHBOARD_DATE_FILTER, DASHBOARD_NUMBER_FILTER],
      hidden: [DASHBOARD_TEXT_FILTER, DASHBOARD_LOCATION_FILTER],
    });

    await assertFilterValues(page, [
      [DASHBOARD_DATE_FILTER, undefined],
      [DASHBOARD_TEXT_FILTER, "fa"],
      [DASHBOARD_NUMBER_FILTER, 20],
      [DASHBOARD_LOCATION_FILTER, undefined],
    ]);
  });

  test("should handle canceling adding a new tab (#38055, #38278)", async ({
    page,
    mb,
  }) => {
    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    await editBar(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();

    // Reproduces #38055
    await expect(
      dashboardGrid(page).getByText(/There's nothing here/),
    ).toHaveCount(0);
    await expect(getDashboardCards(page)).toHaveCount(1);

    // Reproduces #38278
    await editDashboard(page);
    await addHeadingWhileEditing(page, "New heading");
    await saveDashboard(page);
    await expect(
      dashboardGrid(page).getByText("New heading", { exact: true }),
    ).toBeVisible();
    await expect(getDashboardCards(page)).toHaveCount(2);
  });

  test("should allow undoing a tab deletion", async ({ page, mb }) => {
    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    // Delete first tab
    await deleteTab(page, "Tab 1");
    await expect(
      page.getByRole("tab", { name: "Tab 1", exact: true }),
    ).toHaveCount(0);

    // Undo then go back to first tab
    await undo(page);
    await goToTab(page, "Tab 1");
    await expect(
      dashboardCards(page).getByText("Orders", { exact: true }),
    ).toBeVisible();
  });

  test("should allow moving dashcards between tabs", async ({ page, mb }) => {
    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    await goToTab(page, "Tab 1");

    // add second card
    await addLinkWhileEditing(page, "https://www.metabase.com");

    // should stay on the same tab
    await expect(page.getByRole("tab", { selected: true })).toHaveText("Tab 1");

    const card1OriginalSize = await getDashboardCard(page, 0).boundingBox();
    const card2OriginalPosition = await getDashboardCard(page, 1).boundingBox();
    expect(card1OriginalSize).not.toBeNull();
    expect(card2OriginalPosition).not.toBeNull();

    // move second card to second tab first, then the first card. Moving the
    // second card first inverts their position, letting us check the position
    // is restored when undoing the movement of the second one.
    await moveDashCardToTab(page, { tabName: "Tab 2", dashcardIndex: 1 });
    await moveDashCardToTab(page, { tabName: "Tab 2", dashcardIndex: 0 });

    // first tab should be empty
    await expect(page.getByTestId("toast-undo")).toHaveCount(2);
    await expect(getDashboardCards(page)).toHaveCount(0);

    // should show undo toast with the correct text
    const undoList = page.getByTestId("undo-list");
    await expect(
      undoList.getByText("Link card moved", { exact: true }),
    ).toBeVisible();
    await expect(
      undoList.getByText("Card moved: Orders", { exact: true }),
    ).toBeVisible();

    // cards should be in second tab
    await goToTab(page, "Tab 2");
    await expect(getDashboardCards(page)).toHaveCount(2);

    // size should stay the same
    const movedCard1Size = await getDashboardCard(page, 1).boundingBox();
    expect(movedCard1Size?.width).toBeCloseTo(card1OriginalSize!.width, 0);
    expect(movedCard1Size?.height).toBeCloseTo(card1OriginalSize!.height, 0);

    // undoing movement of second card
    await page
      .getByTestId("toast-undo")
      .nth(0)
      .getByRole("button")
      .click();

    await goToTab(page, "Tab 1");

    await expect(getDashboardCards(page)).toHaveCount(1);

    // second card should be in the original position (same grid cell)
    const restoredPosition = await getDashboardCard(page).boundingBox();
    expect(restoredPosition!.x).toBeGreaterThan(card2OriginalPosition!.x - 10);
    expect(restoredPosition!.x).toBeLessThan(card2OriginalPosition!.x + 10);
    expect(restoredPosition!.y).toBeGreaterThan(card2OriginalPosition!.y - 10);
    expect(restoredPosition!.y).toBeLessThan(card2OriginalPosition!.y + 10);
  });

  test("should allow moving different types of dashcards to other tabs", async ({
    page,
    mb,
  }) => {
    const cards = [
      getTextCardDetails({
        text: "Text card",
        // small card aligned to the left so that the move icon is out of the
        // viewport unless the left-alignment logic kicks in
        size_x: 1,
      }),
      getHeadingCardDetails({ text: "Heading card" }),
      getLinkCardDetails({ url: "https://metabase.com" }),
      // getTextCardDetails and getHeading/LinkCardDetails come from different
      // support modules with independent id counters, so their negative ids
      // can collide; reassign unique ids (upstream shared one counter).
    ].map((card, index) => ({ ...card, id: -1 - index }));

    const { id: dashboard_id } = await mb.api.createDashboard();
    await updateDashboardCards(mb.api, { dashboard_id, cards });
    await visitDashboard(page, mb.api, dashboard_id);

    await editDashboard(page);
    await createNewTab(page);
    await goToTab(page, "Tab 1");

    // moving dashcards to second tab
    for (let i = 0; i < cards.length; i++) {
      await moveDashCardToTab(page, { tabName: "Tab 2" });
    }

    await expect(getDashboardCards(page)).toHaveCount(0);

    await goToTab(page, "Tab 2");

    await expect(getDashboardCards(page)).toHaveCount(cards.length);

    await expect(page.getByTestId("toast-undo")).toHaveCount(cards.length);

    // 'Undo' toasts should be dismissed when saving the dashboard
    await saveDashboard(page);

    await expect(page.getByTestId("toast-undo")).toHaveCount(0);
  });

  test("should allow moving dashcard even if we don't have permission on that underlying query", async ({
    page,
    mb,
  }) => {
    const { dashboardId } = await createNativeQuestionAndDashboardInCollections(
      mb.api,
      {
        query: "select 42",
        questionCollectionId: ADMIN_PERSONAL_COLLECTION_ID,
        dashboardCollectionId: NORMAL_PERSONAL_COLLECTION_ID,
      },
    );
    await mb.signInAsNormalUser();
    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);
    await createNewTab(page);

    await goToTab(page, "Tab 1");

    await expect(
      getDashboardCard(page).getByText(/you don't have permission/),
    ).toBeVisible();

    await moveDashCardToTab(page, { tabName: "Tab 2" });

    await saveDashboard(page);

    await expect(getDashboardCards(page)).toHaveCount(0);
  });

  test("should leave dashboard if navigating back after initial load", async ({
    page,
    mb,
  }) => {
    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
    });
    await page.goto("/collection/root");

    await main(page).getByText("Orders in a dashboard", { exact: true }).click();
    await page.goBack();
    await expect(
      main(page).getByText("Our analytics", { exact: true }),
    ).toBeVisible();
  });

  test("should only fetch cards on the current tab", async ({ page, mb }) => {
    const firstQuestion = async () => {
      const res = await mb.api.get(`/api/card/${ORDERS_QUESTION_ID}`);
      return (await res.json()) as { view_count: number };
    };
    const secondQuestion = async () => {
      const res = await mb.api.get(`/api/card/${ORDERS_COUNT_QUESTION_ID}`);
      return (await res.json()) as { view_count: number };
    };

    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    // Add card to second tab
    await icon(page, "pencil").click();
    await openQuestionsSidebar(page);
    const cardQuery = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
    );
    await sidebar(page).getByText("Orders, Count", { exact: true }).click();
    await cardQuery;

    await expect(getDashboardCards(page)).toHaveCount(1);

    const savePut = waitForDashboardPut(page);
    await saveDashboard(page);
    const saveBody = (await (await savePut).json()) as {
      dashcards: { id: number }[];
    };
    const secondTabDashcardId = saveBody.dashcards[1].id;

    const firstTabQueryPath = `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}/query`;
    const secondTabQueryPath = `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${secondTabDashcardId}/card/${ORDERS_COUNT_QUESTION_ID}/query`;
    const firstTabQueries = countRequests(
      page,
      (method, pathname) => method === "POST" && pathname === firstTabQueryPath,
    );
    const secondTabQueries = countRequests(
      page,
      (method, pathname) => method === "POST" && pathname === secondTabQueryPath,
    );

    await expect.poll(async () => (await firstQuestion()).view_count).toBe(1);
    await expect.poll(async () => (await secondQuestion()).view_count).toBe(1);

    // Visit first tab and confirm only first card was queried
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    expect(firstTabQueries.count()).toBe(1);
    expect(secondTabQueries.count()).toBe(0);
    await expect.poll(async () => (await firstQuestion()).view_count).toBe(2);
    await expect.poll(async () => (await secondQuestion()).view_count).toBe(1);

    // Visit second tab and confirm only second card was queried
    const secondTabWait = page.waitForResponse(
      (response) => new URL(response.url()).pathname === secondTabQueryPath,
    );
    await goToTab(page, "Tab 2");
    await secondTabWait;
    expect(secondTabQueries.count()).toBe(1);
    expect(firstTabQueries.count()).toBe(1);
    await expect.poll(async () => (await firstQuestion()).view_count).toBe(2);
    await expect.poll(async () => (await secondQuestion()).view_count).toBe(2);

    // Go back to first tab, expect no additional queries
    await goToTab(page, "Tab 1");
    await expect(
      page.getByTestId("dashcard").filter({ hasText: "37.65" }).first(),
    ).toBeVisible();
    expect(firstTabQueries.count()).toBe(1);
    expect(secondTabQueries.count()).toBe(1);
    await expect.poll(async () => (await firstQuestion()).view_count).toBe(2);
    await expect.poll(async () => (await secondQuestion()).view_count).toBe(2);

    // Go to public dashboard
    await mb.api.updateSetting("enable-public-sharing", true);
    const publicLink = (await (
      await mb.api.post(`/api/dashboard/${ORDERS_DASHBOARD_ID}/public_link`)
    ).json()) as { uuid: string };
    const { uuid } = publicLink;

    const publicFirstPath = `/api/public/dashboard/${uuid}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}`;
    const publicSecondPath = `/api/public/dashboard/${uuid}/dashcard/${secondTabDashcardId}/card/${ORDERS_COUNT_QUESTION_ID}`;
    const publicFirstQueries = countRequests(
      page,
      (method, pathname) => method === "GET" && pathname === publicFirstPath,
    );
    const publicSecondQueries = countRequests(
      page,
      (method, pathname) => method === "GET" && pathname === publicSecondPath,
    );

    const publicFirstWait = page.waitForResponse(
      (response) => new URL(response.url()).pathname === publicFirstPath,
    );
    await page.goto(`/public/dashboard/${uuid}`);
    await publicFirstWait;

    // Check first tab requests
    expect(publicFirstQueries.count()).toBe(1);
    expect(publicSecondQueries.count()).toBe(0);
    await expect.poll(async () => (await firstQuestion()).view_count).toBe(3);
    await expect.poll(async () => (await secondQuestion()).view_count).toBe(2);

    // Visit second tab and confirm only second card was queried
    const publicSecondWait = page.waitForResponse(
      (response) => new URL(response.url()).pathname === publicSecondPath,
    );
    await goToTab(page, "Tab 2");
    await publicSecondWait;
    expect(publicSecondQueries.count()).toBe(1);
    expect(publicFirstQueries.count()).toBe(1);
    await expect.poll(async () => (await firstQuestion()).view_count).toBe(3);
    await expect.poll(async () => (await secondQuestion()).view_count).toBe(3);

    await goToTab(page, "Tab 1");
    expect(publicFirstQueries.count()).toBe(1);
    expect(publicSecondQueries.count()).toBe(1);
  });

  test("should only fetch cards on the current tab of an embedded dashboard", async ({
    page,
    mb,
  }) => {
    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    // Add card to second tab
    await icon(page, "pencil").click();
    await openQuestionsSidebar(page);
    const cardQuery = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
    );
    await sidebar(page).getByText("Orders, Count", { exact: true }).click();
    await cardQuery;

    await expect(getDashboardCards(page)).toHaveCount(1);
    await saveDashboard(page);

    const firstEmbedQueryRe = new RegExp(
      `^/api/embed/dashboard/[^/]+/dashcard/\\d+/card/${ORDERS_QUESTION_ID}$`,
    );
    const secondEmbedQueryRe = new RegExp(
      `^/api/embed/dashboard/[^/]+/dashcard/\\d+/card/${ORDERS_COUNT_QUESTION_ID}$`,
    );
    const firstTabQueries = countRequests(
      page,
      (method, pathname) => method === "GET" && firstEmbedQueryRe.test(pathname),
    );
    const secondTabQueries = countRequests(
      page,
      (method, pathname) =>
        method === "GET" && secondEmbedQueryRe.test(pathname),
    );

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: ORDERS_DASHBOARD_ID,
      activeTab: "parameters",
    });

    // publish the embedded dashboard so we can navigate directly to its url
    await publishChanges(page, "dashboard");

    // directly navigate to the embedded dashboard, starting on Tab 1
    const firstEmbedWait = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        firstEmbedQueryRe.test(new URL(response.url()).pathname),
    );
    const { frame } = await visitIframe(page, mb);
    await firstEmbedWait;

    // wait for results
    await expect(
      frame.getByTestId("dashcard").filter({ hasText: "37.65" }).first(),
    ).toBeVisible();
    expect(firstTabQueries.count()).toBe(1);
    expect(secondTabQueries.count()).toBe(0);

    const secondEmbedWait = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        secondEmbedQueryRe.test(new URL(response.url()).pathname),
    );
    await goToTab(frame, "Tab 2");
    await secondEmbedWait;
    expect(secondTabQueries.count()).toBe(1);
    expect(firstTabQueries.count()).toBe(1);

    await goToTab(frame, "Tab 1");
    expect(firstTabQueries.count()).toBe(1);
    expect(secondTabQueries.count()).toBe(1);
  });

  test("should apply filter and show loading spinner when changing tabs (#33767)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await createNewTab(page);
    await saveDashboard(page);

    await goToTab(page, "Tab 2");
    await editDashboard(page);
    await openQuestionsSidebar(page);
    await sidebar(page).getByText("Orders, Count", { exact: true }).click();
    await expect(getDashboardCards(page)).toHaveCount(1);

    await setFilter(page, "Date picker", "Relative Date");

    await selectDashboardFilter(getDashboardCard(page, 0), "Created At");
    await saveDashboard(page);

    const stopDelaying = await delayResponses(
      page,
      /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/,
      500,
    );

    const savedCard = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
          new URL(response.url()).pathname,
        ),
    );
    await filterWidget(page).click();
    await popover(page).getByText("Previous 7 days", { exact: true }).click();

    // Loader in the 2nd tab
    const secondTabCard = getDashboardCard(page, 0);
    await expect(secondTabCard.getByTestId("loading-indicator")).toBeVisible();
    await savedCard;
    await expect(secondTabCard.getByRole("row").first()).toBeVisible();

    await stopDelaying();

    // we do not auto-wire in different tabs anymore, so the first tab should
    // not show a loader and re-run its query
    await goToTab(page, "Tab 1");
    const firstTabCard = getDashboardCard(page, 0);
    await expect(firstTabCard.getByTestId("loading-indicator")).toHaveCount(0);
    await expect(firstTabCard.getByRole("row").first()).toBeVisible();
  });

  test("should allow me to rearrange long tabs (#34970)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await createNewTab(page);
    await createNewTab(page);

    // Assert initial tab order
    const tabWrappers = page.getByTestId("tab-button-input-wrapper");
    await expect(tabWrappers.nth(0)).toContainText("Tab 1");
    await expect(tabWrappers.nth(1)).toContainText("Tab 2");
    await expect(tabWrappers.nth(2)).toContainText("Tab 3");

    // Prior to the bugfix, a tab this long was too wide to drag left of the others.
    const longName = "This is a really really long tab name";

    const tab3 = page.getByRole("tab", { name: "Tab 3", exact: true });
    await tab3.dblclick();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(longName);
    await page.keyboard.press("Enter");

    const longTab = page.getByRole("tab", { name: longName, exact: true });
    await reorderTabToStart(longTab);

    // After dragging, the long tab is now first. Assert before saving so the
    // drag animation finishes before clicking Save.
    await expect(tabWrappers.nth(0)).toContainText(longName);
    await expect(tabWrappers.nth(1)).toContainText("Tab 1");
    await expect(tabWrappers.nth(2)).toContainText("Tab 2");

    await saveDashboard(page);

    // Confirm positions are the same after saving
    await expect(tabWrappers.nth(0)).toContainText(longName);
    await expect(tabWrappers.nth(1)).toContainText("Tab 1");
    await expect(tabWrappers.nth(2)).toContainText("Tab 2");
  });

  test("should allow users to duplicate and delete tabs more than once (#45364)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await duplicateTab(page, "Tab 1");

    await expect(page.getByRole("tab").nth(0)).toHaveText("Tab 1");
    await expect(page.getByRole("tab").nth(1)).toHaveText("Copy of Tab 1");

    await duplicateTab(page, "Tab 1");

    await expect(page.getByRole("tab").nth(0)).toHaveText("Tab 1");
    await expect(page.getByRole("tab").nth(1)).toHaveText("Copy of Tab 1");
    await expect(page.getByRole("tab").nth(2)).toHaveText("Copy of Tab 1");

    await deleteTab(page, "Tab 1");

    await expect(page.getByRole("tab").nth(0)).toHaveText("Copy of Tab 1");
    await expect(page.getByRole("tab").nth(1)).toHaveText("Copy of Tab 1");

    await page.getByRole("tab").nth(0).getByRole("button").click();
    await popover(page).getByText("Delete", { exact: true }).click();

    await expect(page.getByRole("tab")).toHaveText("Copy of Tab 1");
  });
});

// TODO: no snowplow-micro container in the spike harness (port rule 6). These
// two tests keep their real UI actions; only the snowplow event assertions
// (reset/enable/expect/assertNo) are neutered.
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
  _count?: number,
) => {};
const assertNoUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
) => {};

test.describe("scenarios > dashboard > tabs (snowplow)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsAdmin();
    await enableTracking();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("should send snowplow events when dashboard tabs are created and deleted", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await editDashboard(page);
    await createNewTab(page);
    await saveDashboard(page);
    await expectUnstructuredSnowplowEvent({ event: "dashboard_saved" });
    await expectUnstructuredSnowplowEvent({ event: "dashboard_tab_created" });

    await editDashboard(page);
    await deleteTab(page, "Tab 2");
    await saveDashboard(page);
    await expectUnstructuredSnowplowEvent({ event: "dashboard_saved" }, 2);
    await expectUnstructuredSnowplowEvent({ event: "dashboard_tab_deleted" });
  });

  test("should send snowplow events when cards are moved between tabs", async ({
    page,
    mb,
  }) => {
    const cardMovedEventName = "card_moved_to_tab";

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await assertNoUnstructuredSnowplowEvent({ event: cardMovedEventName });

    await editDashboard(page);
    await createNewTab(page);
    await goToTab(page, "Tab 1");

    await moveDashCardToTab(page, { tabName: "Tab 2" });

    await expectUnstructuredSnowplowEvent({ event: cardMovedEventName });
  });
});
