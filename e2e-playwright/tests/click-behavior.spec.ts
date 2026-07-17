/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/click-behavior.cy.spec.js
 *
 * Notes vs the original:
 * - The `cy.intercept("/api/dataset").as("dataset")` from beforeEach becomes
 *   per-test waitForResponse registrations at the true trigger points.
 * - Hard-coded `http://localhost:4000` link templates / site-url values use
 *   `mb.baseUrl` instead — under per-worker backends port 4000 isn't ours.
 * - `H.onNextAnchorClick` is ported as captureNextAnchorClick /
 *   expectCapturedAnchor (same HTMLAnchorElement.prototype.click patch).
 */
import type { Page, Response } from "@playwright/test";

import { resolveToken } from "../support/api";
import {
  DASHBOARD_FILTER_NUMBER,
  DASHBOARD_FILTER_TEXT,
  DASHBOARD_FILTER_TEXT_WITH_DEFAULT,
  DASHBOARD_FILTER_TIME,
  COLUMN_INDEX,
  COUNT_COLUMN_ID,
  COUNT_COLUMN_NAME,
  COUNT_COLUMN_SOURCE,
  CREATED_AT_COLUMN_ID,
  CREATED_AT_COLUMN_NAME,
  CREATED_AT_COLUMN_SOURCE,
  FIRST_TAB,
  NORMAL_USER_ID,
  OBJECT_DETAIL_CHART,
  POINT_COUNT,
  POINT_CREATED_AT,
  POINT_CREATED_AT_FORMATTED,
  QUESTION_LINE_CHART,
  QUESTION_TABLE,
  RESTRICTED_COLLECTION_NAME,
  SECOND_TAB,
  TARGET_DASHBOARD,
  TARGET_QUESTION,
  THIRD_TAB,
  LINK_URL,
  URL_WITH_FILLED_PARAMS,
  URL_WITH_PARAMS,
  USER_GROUPS,
  addDashboardDestination,
  addNumericParameter,
  addSavedQuestionCreatedAtParameter,
  addSavedQuestionDestination,
  addSavedQuestionQuantityParameter,
  addTextParameter,
  addTextWithDefaultParameter,
  addTimeParameter,
  addUrlDestination,
  aside,
  assertDrillThroughMenuOpen,
  captureNextAnchorClick,
  caseSensitive,
  clickLineChartPoint,
  createDashboard,
  createDashboardWithTabsLocal,
  createMockDashboardCard,
  createMultiStageQuery,
  createNumberFilterMapping,
  createQuestion,
  createQuestionAndDashboard,
  createTextFilterMapping,
  createTextFilterWithDefaultMapping,
  createTimeFilterMapping,
  customizeLinkText,
  dashboardParametersPopover,
  expectCapturedAnchor,
  expectFilterWidgets,
  expectLocation,
  filterWidgetWithLabel,
  getActionCardDetails,
  getClickMapping,
  getCountToDashboardFilterMapping,
  getCountToDashboardMapping,
  getCreatedAtToQuestionMapping,
  getCreatedAtToUrlMapping,
  getHeadingCardDetails,
  getLinkCardDetails,
  getTableCell,
  getTextCardDetails,
  tabSlugMap,
  testChangingBackToDefaultBehavior,
  updateCollectionGraph,
  updateDashboardCards,
  verifyAvailableClickTargetColumns,
  verifyNotebookQuery,
  verifyVizTypeIsLine,
} from "../support/click-behavior";
import {
  dashboardHeader,
  editDashboard,
  filterWidget,
  getDashboardCard,
  modal,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import { icon, inputWithValue } from "../support/dashboard-cards";
import {
  addOrUpdateDashboardCard,
  createNativeQuestionAndDashboard,
} from "../support/dashboard-management";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import {
  openLegacyStaticEmbeddingModal,
  visitIframe,
} from "../support/embedding";
import { test, expect } from "../support/fixtures";
import {
  fieldValuesCombobox,
  removeFieldValuesValue,
} from "../support/native-filters";
import { entityPickerModal, openNotebook } from "../support/notebook";
import { visitEmbeddedPage } from "../support/question-saved";
import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { createCollection } from "../support/search";
import { popover, queryBuilderHeader, visitDashboard } from "../support/ui";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

// The command-palette module also exports this id, but importing the whole
// module drags in unrelated helpers; the lookup is one line.
import { ORDERS_BY_YEAR_QUESTION_ID } from "../support/command-palette";

function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

function waitForEmbedDashboard(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    /^\/api\/embed\/dashboard\/[^/]+$/.test(
      new URL(response.url()).pathname,
    ),
  );
}

function waitForEmbedCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    /^\/api\/embed\/dashboard\/.+\/card\/\d+/.test(
      new URL(response.url()).pathname,
    ),
  );
}

/** Count GET requests to /api/collection/root and /api/collection (the
 * "no page reload" spies from metabase#33379). */
function trackCollectionRequests(page: Page) {
  const counts = { rootCollection: 0, collections: 0 };
  page.on("request", (request) => {
    if (request.method() !== "GET") {
      return;
    }
    const { pathname } = new URL(request.url());
    if (pathname === "/api/collection/root") {
      counts.rootCollection += 1;
    }
    if (pathname === "/api/collection") {
      counts.collections += 1;
    }
  });
  return counts;
}

async function openClickBehaviorSidebar(page: Page, index = 0) {
  await getDashboardCard(page, index).hover();
  await icon(getDashboardCard(page, index), "click").click();
}

test.describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test.describe("dashcards without click behavior", () => {
    test("does not allow to set click behavior for virtual dashcards", async ({
      page,
      mb,
    }) => {
      const textCard = getTextCardDetails({ size_y: 1 });
      const headingCard = getHeadingCardDetails({ text: "Heading card" });
      const actionCard = getActionCardDetails();
      const linkCard = getLinkCardDetails();
      const cards = [textCard, headingCard, actionCard, linkCard];

      const { id: dashboardId } = await createDashboard(mb.api);
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);

      for (let index = 0; index < cards.length; index++) {
        const card = getDashboardCard(page, index);
        await card.hover();
        await expect(icon(card, "click")).toHaveCount(0);
      }
    });

    test("does not allow to set click behavior for object detail dashcard", async ({
      page,
      mb,
    }) => {
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails: OBJECT_DETAIL_CHART,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      const card = getDashboardCard(page);
      await card.hover();
      await expect(icon(card, "click")).toHaveCount(0);
    });
  });

  test.describe("line chart", () => {
    const questionDetails = QUESTION_LINE_CHART;

    test("should open drill-through menu as a default click-behavior", async ({
      page,
      mb,
    }) => {
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await clickLineChartPoint(page);
      await assertDrillThroughMenuOpen(page);
    });

    test("should open drill-through menu for native query based dashcard", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Native Question",
          display: "line",
          native: {
            query: `
              SELECT
                DATE_TRUNC('month', CREATED_AT) AS "Created At",
                COUNT(*) AS "count"
              FROM
                ORDERS
              GROUP BY
                DATE_TRUNC('month', CREATED_AT)
              LIMIT
                5
            `,
          },
        },
        dashboardDetails: {
          name: "Dashboard",
        },
      });
      await visitDashboard(page, mb.api, dashboardId);

      await clickLineChartPoint(page);
      // TODO: fix it, currently we drill down to the question on dot click
      // assertDrillThroughMenuOpen();
    });

    test("allows setting dashboard without filters as custom destination and changing it back to default click behavior", async ({
      page,
      mb,
    }) => {
      // doesn't throw when setting default behavior (metabase#35354)
      const pageErrors: Error[] = [];
      page.on("pageerror", (error) => pageErrors.push(error));

      const { id: targetDashboardId } = await createDashboard(
        mb.api,
        TARGET_DASHBOARD,
      );
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);
      await openClickBehaviorSidebar(page);

      // When the default menu is selected, it should've visual cue (metabase#34848)
      const defaultOption = aside(page)
        .getByText("Open the Metabase drill-through menu", { exact: true })
        .locator("..")
        .locator("..");
      await expect(defaultOption).toHaveAttribute("aria-selected", "true");
      await expect(defaultOption).toHaveCSS(
        "background-color",
        "rgb(80, 158, 226)",
      );

      await addDashboardDestination(page);
      await expect(
        aside(page).getByText("Select a dashboard tab", { exact: true }),
      ).toHaveCount(0);
      await expect(
        aside(page).getByText("No available targets", { exact: true }),
      ).toBeVisible();
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      const collectionRequests = trackCollectionRequests(page);

      await clickLineChartPoint(page);
      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboardId}`,
        search: "",
      });

      // Should navigate to question using router (metabase#33379)
      await expect(
        dashboardHeader(page).getByText(TARGET_DASHBOARD.name, {
          exact: true,
        }),
      ).toBeVisible();
      // If the page was reloaded, many API request would have been made and
      // these calls are 2 of those.
      expect(collectionRequests.rootCollection).toBe(0);
      expect(collectionRequests.collections).toBe(0);

      expect(
        pageErrors.filter((error) => error.name.includes("TypeError")),
      ).toEqual([]);
    });

    test("allows setting dashboard with single parameter as custom destination", async ({
      page,
      mb,
    }) => {
      const { id: targetDashboardId } = await createDashboard(mb.api, {
        ...TARGET_DASHBOARD,
        parameters: [DASHBOARD_FILTER_TEXT],
      });
      await mb.api.put(`/api/dashboard/${targetDashboardId}`, {
        dashcards: [
          createMockDashboardCard({
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            ],
          }),
        ],
      });

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addDashboardDestination(page);
      await expect(
        aside(page).getByText("Select a dashboard tab", { exact: true }),
      ).toHaveCount(0);
      await expect(
        aside(page).getByText("No available targets", { exact: true }),
      ).toHaveCount(0);
      await addTextParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expectFilterWidgets(page, 1, POINT_COUNT);
      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboardId}`,
        search: `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}`,
      });
    });

    test("allows setting dashboard with multiple parameters as custom destination", async ({
      page,
      mb,
    }) => {
      const { id: targetDashboardId } = await createDashboard(mb.api, {
        ...TARGET_DASHBOARD,
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      });
      await mb.api.put(`/api/dashboard/${targetDashboardId}`, {
        dashcards: [
          createMockDashboardCard({
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              createTimeFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            ],
          }),
        ],
      });

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addDashboardDestination(page);
      await expect(
        aside(page).getByText("Select a dashboard tab", { exact: true }),
      ).toHaveCount(0);
      await expect(
        aside(page).getByText("No available targets", { exact: true }),
      ).toHaveCount(0);
      await addTextParameter(page);
      await addTimeParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expectFilterWidgets(
        page,
        2,
        POINT_COUNT,
        POINT_CREATED_AT_FORMATTED,
      );
      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboardId}`,
        search: `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
      });
    });

    test("allows setting dashboard tab with parameter as custom destination", async ({
      page,
      mb,
    }) => {
      const targetDashboard = await createDashboardWithTabsLocal(mb.api, {
        dashboard: {
          ...TARGET_DASHBOARD,
          parameters: [DASHBOARD_FILTER_TEXT],
        },
        tabs: [FIRST_TAB, SECOND_TAB, THIRD_TAB],
        dashcards: [
          createMockDashboardCard({
            dashboard_tab_id: SECOND_TAB.id,
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            ],
          }),
        ],
      });
      const TAB_SLUG_MAP = tabSlugMap(targetDashboard);

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addDashboardDestination(page);
      const tabSelect = aside(page).getByLabel("Select a dashboard tab");
      await expect(tabSelect).toHaveValue(FIRST_TAB.name);
      await tabSelect.click();
      await page
        .getByRole("listbox")
        .getByText(SECOND_TAB.name, { exact: true })
        .click();
      await expect(
        aside(page).getByText("No available targets", { exact: true }),
      ).toHaveCount(0);
      await addTextParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expectFilterWidgets(page, 1, POINT_COUNT);
      const tabParam = `tab=${TAB_SLUG_MAP[SECOND_TAB.name]}`;
      const textFilterParam = `${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}`;
      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboard.id}`,
        search: `?${textFilterParam}&${tabParam}`,
      });
    });

    test("should show error and disable the form after target dashboard tab has been removed and there is more than 1 tab left", async ({
      page,
      mb,
    }) => {
      const targetDashboard = await createDashboardWithTabsLocal(mb.api, {
        dashboard: TARGET_DASHBOARD,
        tabs: [FIRST_TAB, SECOND_TAB, THIRD_TAB],
      });
      const TAB_SLUG_MAP = tabSlugMap(targetDashboard);

      const inexistingTabId = 999;
      const cardDetails = {
        visualization_settings: {
          click_behavior: {
            parameterMapping: {},
            targetId: targetDashboard.id,
            tabId: inexistingTabId,
            linkType: "dashboard",
            type: "link",
          },
        },
      };
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        cardDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);
      await openClickBehaviorSidebar(page);

      await expect(
        aside(page).getByText("The selected tab is no longer available", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();

      const tabSelect = aside(page).getByLabel("Select a dashboard tab");
      await expect(tabSelect).toHaveValue("");
      await tabSelect.click();
      await page
        .getByRole("listbox")
        .getByText(SECOND_TAB.name, { exact: true })
        .click();

      await expect(
        aside(page).getByText("The selected tab is no longer available", {
          exact: true,
        }),
      ).toHaveCount(0);
      const doneButton = page.getByRole("button", {
        name: "Done",
        exact: true,
      });
      await expect(doneButton).toBeEnabled();
      await doneButton.click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboard.id}`,
        search: `?tab=${TAB_SLUG_MAP[SECOND_TAB.name]}`,
      });
    });

    test("should fall back to the first tab after target dashboard tab has been removed and there is only 1 tab left", async ({
      page,
      mb,
    }) => {
      const { id: targetDashboardId } = await createDashboard(
        mb.api,
        TARGET_DASHBOARD,
      );

      const inexistingTabId = 999;
      const cardDetails = {
        visualization_settings: {
          click_behavior: {
            parameterMapping: {},
            targetId: targetDashboardId,
            tabId: inexistingTabId,
            linkType: "dashboard",
            type: "link",
          },
        },
      };
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        cardDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);
      await openClickBehaviorSidebar(page);

      // Wait for the click behavior sidebar to finish loading the target
      // dashboard before saving. The `migrateDeletedTab` effect that falls the
      // now-invalid tabId back to the first tab — which is what dirties the
      // dashboard and triggers the save request — only runs once the target
      // dashboard has loaded. Asserting the tab selector is absent passes
      // trivially before that load, so we anchor on a positive signal first.
      await expect(
        aside(page).getByText(
          "Pass values to this dashboard's filters (optional)",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        aside(page).getByLabel("Select a dashboard tab"),
      ).toHaveCount(0);
      const doneButton = aside(page).getByRole("button", { name: "Done" });
      await expect(doneButton).toBeEnabled();
      await doneButton.click();
      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboardId}`,
        search: "",
      });
    });

    test("dashboard click behavior works without tabId previously saved", async ({
      page,
      mb,
    }) => {
      const targetDashboard = await createDashboardWithTabsLocal(mb.api, {
        dashboard: TARGET_DASHBOARD,
        tabs: [FIRST_TAB, SECOND_TAB, THIRD_TAB],
      });
      const TAB_SLUG_MAP = tabSlugMap(targetDashboard);

      const cardDetails = {
        visualization_settings: {
          click_behavior: {
            parameterMapping: {},
            targetId: targetDashboard.id,
            tabId: undefined,
            linkType: "dashboard",
            type: "link",
          },
        },
      };
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        cardDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await expect(
        aside(page).getByLabel("Select a dashboard tab"),
      ).toHaveValue(FIRST_TAB.name);

      await page
        .getByTestId("edit-bar")
        .getByRole("button", { name: "Cancel" })
        .click();
      // migrateUndefinedDashboardTabId causes detection of changes even though
      // user did not change anything
      await modal(page)
        .getByRole("button", { name: "Discard changes" })
        .click();
      await expect(
        page.getByRole("button", { name: "Cancel", exact: true }),
      ).toHaveCount(0);
      await expect(
        page
          .getByTestId("visualization-root")
          .getByText("May 2025", { exact: true }),
      ).toBeVisible();
      await clickLineChartPoint(page);
      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboard.id}`,
        search: `?tab=${TAB_SLUG_MAP[FIRST_TAB.name]}`,
      });
    });

    test("sets non-specified parameters to default values when accessed from a click action", async ({
      page,
      mb,
    }) => {
      const { id: targetDashboardId } = await createDashboard(mb.api, {
        ...TARGET_DASHBOARD,
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TEXT_WITH_DEFAULT],
      });
      await mb.api.put(`/api/dashboard/${targetDashboardId}`, {
        dashcards: [
          createMockDashboardCard({
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              createTextFilterWithDefaultMapping({
                card_id: ORDERS_QUESTION_ID,
              }),
            ],
          }),
        ],
      });
      await visitDashboard(page, mb.api, targetDashboardId);

      await filterWidget(page).filter({ hasText: "Hello" }).click();
      const paramPopover = dashboardParametersPopover(page);
      await fieldValuesCombobox(paramPopover).click();
      await page.keyboard.press("Backspace");
      await page.keyboard.type("World");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await paramPopover
        .getByRole("button", { name: "Update filter" })
        .click();

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addDashboardDestination(page);
      await expect(
        aside(page).getByText("Select a dashboard tab", { exact: true }),
      ).toHaveCount(0);
      await expect(
        aside(page).getByText("No available targets", { exact: true }),
      ).toHaveCount(0);
      await addTextParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);

      await expect(
        filterWidgetWithLabel(page, DASHBOARD_FILTER_TEXT.name),
      ).toContainText(String(POINT_COUNT));
      await expect(
        filterWidgetWithLabel(page, DASHBOARD_FILTER_TEXT_WITH_DEFAULT.name),
      ).toContainText(DASHBOARD_FILTER_TEXT_WITH_DEFAULT.default);

      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboardId}`,
        search: `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TEXT_WITH_DEFAULT.slug}=Hello`,
      });
    });

    test("sets parameters with default values to the correct value when accessed via click action", async ({
      page,
      mb,
    }) => {
      const { id: targetDashboardId } = await createDashboard(mb.api, {
        ...TARGET_DASHBOARD,
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TEXT_WITH_DEFAULT],
      });
      await mb.api.put(`/api/dashboard/${targetDashboardId}`, {
        dashcards: [
          createMockDashboardCard({
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              createTextFilterWithDefaultMapping({
                card_id: ORDERS_QUESTION_ID,
              }),
            ],
          }),
        ],
      });
      await visitDashboard(page, mb.api, targetDashboardId);

      await filterWidgetWithLabel(page, DASHBOARD_FILTER_TEXT.name).click();
      let paramPopover = dashboardParametersPopover(page);
      await fieldValuesCombobox(paramPopover).click();
      await page.keyboard.type("John Doe");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await paramPopover.getByRole("button", { name: "Add filter" }).click();

      await filterWidgetWithLabel(
        page,
        DASHBOARD_FILTER_TEXT_WITH_DEFAULT.name,
      ).click();
      paramPopover = dashboardParametersPopover(page);
      await fieldValuesCombobox(paramPopover).click();
      await page.keyboard.press("Backspace");
      await page.keyboard.type("World");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await paramPopover
        .getByRole("button", { name: "Update filter" })
        .click();

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addDashboardDestination(page);
      await expect(
        aside(page).getByText("Select a dashboard tab", { exact: true }),
      ).toHaveCount(0);
      await expect(
        aside(page).getByText("No available targets", { exact: true }),
      ).toHaveCount(0);
      await addTextWithDefaultParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expect(
        filterWidgetWithLabel(page, DASHBOARD_FILTER_TEXT_WITH_DEFAULT.name),
      ).toContainText(String(POINT_COUNT));

      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboardId}`,
        search: `?${DASHBOARD_FILTER_TEXT.slug}=&${DASHBOARD_FILTER_TEXT_WITH_DEFAULT.slug}=${POINT_COUNT}`,
      });
    });

    test("does not allow setting dashboard as custom destination if user has no permissions to it", async ({
      page,
      mb,
    }) => {
      const restrictedCollection = await createCollection(mb.api, {
        name: RESTRICTED_COLLECTION_NAME,
      });
      await updateCollectionGraph(mb.api, {
        [USER_GROUPS.COLLECTION_GROUP]: {
          [restrictedCollection.id]: "none",
        },
      });
      await createDashboard(mb.api, {
        ...TARGET_DASHBOARD,
        collection_id: restrictedCollection.id,
      });

      await mb.signOut();
      await mb.signInAsNormalUser();

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await aside(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await aside(page).getByText("Dashboard", { exact: true }).click();

      const picker = entityPickerModal(page);
      // Anchor on the picker's content having loaded before asserting absence.
      await expect(
        picker.getByText("Our analytics", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        picker.getByText(RESTRICTED_COLLECTION_NAME, { exact: true }),
      ).toHaveCount(0);
    });

    test("allows setting saved question as custom destination and changing it back to default click behavior", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await createQuestion(mb.api, TARGET_QUESTION);
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addSavedQuestionDestination(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      const collectionRequests = trackCollectionRequests(page);

      await clickLineChartPoint(page);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toContain(`/question/${questionId}`);
      await expect(async () => {
        await inputWithValue(queryBuilderHeader(page), TARGET_QUESTION.name);
      }).toPass();

      // Should navigate to question using router (metabase#33379)
      await expect(page.getByTestId("view-footer")).toContainText(
        "Showing 5 rows",
      );
      // If the page was reloaded, many API request would have been made and
      // these calls are 2 of those.
      expect(collectionRequests.rootCollection).toBe(0);
      expect(collectionRequests.collections).toBe(0);

      await page.goBack();
      await testChangingBackToDefaultBehavior(page);
    });

    test("allows setting saved question with single parameter as custom destination", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, TARGET_QUESTION);
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addSavedQuestionDestination(page);
      await addSavedQuestionCreatedAtParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expect(queryBuilderFiltersPanel(page)).toHaveText(
        "Created At is Jul 1–31, 2025",
      );

      await expect.poll(() => new URL(page.url()).pathname).toBe("/question");
      await expect(page.getByTestId("app-bar")).toContainText(
        `Started from ${TARGET_QUESTION.name}`,
      );
      await verifyVizTypeIsLine(page);

      await openNotebook(page);
      await verifyNotebookQuery(page, "Orders", [
        {
          filters: ["Created At is Jul 1–31, 2025"],
          aggregations: ["Count"],
          breakouts: ["Created At: Month"],
          limit: 5,
        },
      ]);

      await page.goBack();
      // return to the dashboard
      await page.goBack();
      await testChangingBackToDefaultBehavior(page);
    });

    test("allows setting saved question with multiple parameters as custom destination", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, TARGET_QUESTION);
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addSavedQuestionDestination(page);
      await addSavedQuestionCreatedAtParameter(page);
      await addSavedQuestionQuantityParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      const dataset = waitForDataset(page);
      await clickLineChartPoint(page);
      await dataset;
      await expect(queryBuilderFiltersPanel(page)).toContainText(
        "Created At is Jul 1–31, 2025",
      );
      await expect(queryBuilderFiltersPanel(page)).toContainText(
        "Quantity is equal to 64",
      );

      await expect.poll(() => new URL(page.url()).pathname).toBe("/question");
      await expect(page.getByTestId("app-bar")).toContainText(
        `Started from ${TARGET_QUESTION.name}`,
      );
      await verifyVizTypeIsLine(page);

      await openNotebook(page);
      await verifyNotebookQuery(page, "Orders", [
        {
          filters: ["Created At is Jul 1–31, 2025", "Quantity is equal to 64"],
          aggregations: ["Count"],
          breakouts: ["Created At: Month"],
          limit: 5,
        },
      ]);
    });

    test("does not allow setting saved question as custom destination if user has no permissions to it", async ({
      page,
      mb,
    }) => {
      const restrictedCollection = await createCollection(mb.api, {
        name: RESTRICTED_COLLECTION_NAME,
      });
      await updateCollectionGraph(mb.api, {
        [USER_GROUPS.COLLECTION_GROUP]: {
          [restrictedCollection.id]: "none",
        },
      });
      await createQuestion(mb.api, {
        ...TARGET_QUESTION,
        collection_id: restrictedCollection.id,
      });

      await mb.signOut();
      await mb.signInAsNormalUser();

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await aside(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await aside(page).getByText("Saved question", { exact: true }).click();

      const picker = entityPickerModal(page);
      await expect(
        picker.getByText("Our analytics", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        picker.getByText(RESTRICTED_COLLECTION_NAME, { exact: true }),
      ).toHaveCount(0);
    });

    test("allows setting URL as custom destination and changing it back to default click behavior", async ({
      page,
      mb,
    }) => {
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addUrlDestination(page);
      const dialog = modal(page);
      await dialog.getByRole("textbox").fill(LINK_URL);
      await dialog.getByRole("button", { name: "Done" }).click();
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await captureNextAnchorClick(page);
      await clickLineChartPoint(page);
      await expectCapturedAnchor(page, {
        href: LINK_URL,
        rel: "noopener",
        target: "_blank",
      });

      await testChangingBackToDefaultBehavior(page);
    });

    test("allows setting URL with parameters as custom destination", async ({
      page,
      mb,
    }) => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT],
      };

      const dashcard = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashcard.dashboard_id,
        card_id: dashcard.card_id,
        card: {
          parameter_mappings: [
            createTextFilterMapping({ card_id: dashcard.card_id }),
          ],
        },
      });
      await visitDashboard(page, mb.api, dashcard.dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await addUrlDestination(page);
      const dialog = modal(page);
      await dialog
        .getByText("Values you can reference", { exact: true })
        .click();
      await expect(
        popover(page).getByText(COUNT_COLUMN_ID, { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText(CREATED_AT_COLUMN_ID, { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText(DASHBOARD_FILTER_TEXT.name, { exact: true }),
      ).toBeVisible();
      await dialog
        .getByText("Values you can reference", { exact: true })
        .click();
      await dialog.getByRole("textbox").fill(URL_WITH_PARAMS);
      await dialog.getByRole("button", { name: "Done" }).click();
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await page
        .getByRole("button", { name: DASHBOARD_FILTER_TEXT.name })
        .click();
      const paramPopover = dashboardParametersPopover(page);
      await paramPopover
        .getByPlaceholder("Search the list")
        .pressSequentially("Dell Adams");
      await paramPopover.getByRole("button", { name: "Add filter" }).click();

      await captureNextAnchorClick(page);
      await clickLineChartPoint(page);
      await expectCapturedAnchor(page, {
        href: URL_WITH_FILLED_PARAMS,
        rel: "noopener",
        target: "_blank",
      });
    });

    test("does not allow updating dashboard filters if there are none", async ({
      page,
      mb,
    }) => {
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await expect(
        aside(page).getByText("Update a dashboard filter", { exact: true }),
      ).toHaveCSS("pointer-events", "none");
    });

    test("allows updating single dashboard filter and changing it back to default click behavior", async ({
      page,
      mb,
    }) => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_NUMBER],
      };

      const dashcard = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashcard.dashboard_id,
        card_id: dashcard.card_id,
        card: {
          parameter_mappings: [
            createNumberFilterMapping({ card_id: dashcard.card_id }),
          ],
        },
      });
      await visitDashboard(page, mb.api, dashcard.dashboard_id);
      const originalPathname = new URL(page.url()).pathname;

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await aside(page)
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await addNumericParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expectFilterWidgets(page, 1, POINT_COUNT);
      await expectLocation(page, {
        pathname: originalPathname,
        search: `?${DASHBOARD_FILTER_NUMBER.slug}=${POINT_COUNT}`,
      });

      // reset filter state
      await filterWidget(page).hover();
      await icon(filterWidget(page), "close").click();

      await testChangingBackToDefaultBehavior(page);
    });

    test("behavior is updated after linked dashboard filter has been removed", async ({
      page,
      mb,
    }) => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      };

      const dashcard = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashcard.dashboard_id,
        card_id: dashcard.card_id,
        card: {
          parameter_mappings: [
            createTextFilterMapping({ card_id: dashcard.card_id }),
            createTimeFilterMapping({ card_id: dashcard.card_id }),
          ],
        },
      });
      await visitDashboard(page, mb.api, dashcard.dashboard_id);
      const originalPathname = new URL(page.url()).pathname;

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await aside(page)
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await addTextParameter(page);
      await addTimeParameter(page);
      await expect(aside(page)).toContainText(DASHBOARD_FILTER_TEXT.name);
      await expect(aside(page)).toContainText(COUNT_COLUMN_NAME);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await editDashboard(page);
      await page
        .getByTestId("edit-dashboard-parameters-widget-container")
        .getByText(DASHBOARD_FILTER_TEXT.name, { exact: true })
        .click();
      await aside(page).getByRole("button", { name: "Remove" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expectFilterWidgets(page, 1, POINT_CREATED_AT_FORMATTED);
      await expectLocation(page, {
        pathname: originalPathname,
        search: `?${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
      });

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await expect(aside(page)).not.toContainText(DASHBOARD_FILTER_TEXT.name);
      await expect(aside(page)).not.toContainText(COUNT_COLUMN_NAME);
    });

    test("allows updating multiple dashboard filters", async ({
      page,
      mb,
    }) => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      };

      const dashcard = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashcard.dashboard_id,
        card_id: dashcard.card_id,
        card: {
          parameter_mappings: [
            createTextFilterMapping({ card_id: dashcard.card_id }),
            createTimeFilterMapping({ card_id: dashcard.card_id }),
          ],
        },
      });
      await visitDashboard(page, mb.api, dashcard.dashboard_id);
      const originalPathname = new URL(page.url()).pathname;

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await aside(page)
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await addTextParameter(page);
      await addTimeParameter(page);
      await aside(page).getByRole("button", { name: "Done" }).click();

      await saveDashboard(page);

      await clickLineChartPoint(page);
      await expectFilterWidgets(
        page,
        2,
        POINT_COUNT,
        POINT_CREATED_AT_FORMATTED,
      );
      await expectLocation(page, {
        pathname: originalPathname,
        search: `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
      });
    });
  });

  test.describe("table", () => {
    const questionDetails = QUESTION_TABLE;
    const dashboardDetails = {
      parameters: [DASHBOARD_FILTER_TEXT],
    };

    test("should open drill-through menu as a default click-behavior", async ({
      page,
      mb,
    }) => {
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await getTableCell(page, COLUMN_INDEX.COUNT).click();
      await expect(popover(page)).toContainText("Filter by this value");

      await getTableCell(page, COLUMN_INDEX.CREATED_AT).click();
      await expect(popover(page)).toContainText(
        "Filter by this date and time",
      );

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await expect(getDashboardCard(page).getByRole("button")).toHaveText(
        "Open the drill-through menu",
      );
    });

    test("should allow setting dashboard and saved question as custom destination for different columns", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, TARGET_QUESTION);
      const { id: targetDashboardId } = await createDashboard(mb.api, {
        ...TARGET_DASHBOARD,
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
        dashcards: [
          createMockDashboardCard({
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              createTimeFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            ],
          }),
        ],
      });
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);

      // custom destination (dashboard) behavior for 'Count' column
      await expect(getCountToDashboardMapping(page)).toHaveCount(0);
      await aside(page).getByText(COUNT_COLUMN_NAME, { exact: true }).click();
      await addDashboardDestination(page);
      await expect(
        aside(page).getByText("Select a dashboard tab", { exact: true }),
      ).toHaveCount(0);
      await expect(
        aside(page).getByText("No available targets", { exact: true }),
      ).toHaveCount(0);
      await addTextParameter(page);
      await addTimeParameter(page);
      await customizeLinkText(page, `Count: {{${COUNT_COLUMN_ID}}}`);

      await icon(page, "chevronleft").click();

      await expect(getCountToDashboardMapping(page)).toBeVisible();
      await expect(getDashboardCard(page).getByRole("button")).toHaveText(
        "1 column has custom behavior",
      );

      // custom destination (question) behavior for 'Created at' column
      await expect(getCreatedAtToQuestionMapping(page)).toHaveCount(0);
      await aside(page)
        .getByText(CREATED_AT_COLUMN_NAME, { exact: true })
        .click();
      await addSavedQuestionDestination(page);
      await addSavedQuestionCreatedAtParameter(page);
      await addSavedQuestionQuantityParameter(page);
      await customizeLinkText(
        page,
        `Created at: {{${CREATED_AT_COLUMN_ID}}}`,
      );

      await icon(page, "chevronleft").click();

      await expect(getCreatedAtToQuestionMapping(page)).toBeVisible();
      await expect(getDashboardCard(page).getByRole("button")).toHaveText(
        "2 columns have custom behavior",
      );

      await aside(page).getByRole("button", { name: "Done" }).click();
      await saveDashboard(page);

      // it handles 'Count' column click
      const countCell = getTableCell(page, COLUMN_INDEX.COUNT);
      await expect(countCell).toHaveText(`Count: ${POINT_COUNT}`);
      await countCell.click();

      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboardId}`,
        search: `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
      });

      await expectFilterWidgets(
        page,
        2,
        POINT_COUNT,
        POINT_CREATED_AT_FORMATTED,
      );

      await page.goBack();

      // it handles 'Created at' column click
      const dataset = waitForDataset(page);
      const createdAtCell = getTableCell(page, COLUMN_INDEX.CREATED_AT);
      await expect(createdAtCell).toHaveText(
        `Created at: ${POINT_CREATED_AT_FORMATTED}`,
      );
      await createdAtCell.click();
      await dataset;
      await expect(queryBuilderFiltersPanel(page)).toContainText(
        "Created At is Jul 1–31, 2025",
      );
      await expect(queryBuilderFiltersPanel(page)).toContainText(
        "Quantity is equal to 64",
      );

      await expect.poll(() => new URL(page.url()).pathname).toBe("/question");
      await expect(page.getByTestId("app-bar")).toContainText(
        `Started from ${TARGET_QUESTION.name}`,
      );
      await verifyVizTypeIsLine(page);

      await openNotebook(page);
      await verifyNotebookQuery(page, "Orders", [
        {
          filters: ["Created At is Jul 1–31, 2025", "Quantity is equal to 64"],
          aggregations: ["Count"],
          breakouts: ["Created At: Month"],
          limit: 5,
        },
      ]);
    });

    test("should allow setting dashboard tab with parameter for a column", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, TARGET_QUESTION);

      const targetDashboard = await createDashboardWithTabsLocal(mb.api, {
        dashboard: {
          ...TARGET_DASHBOARD,
          parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
        },
        tabs: [FIRST_TAB, SECOND_TAB, THIRD_TAB],
        dashcards: [
          createMockDashboardCard({
            dashboard_tab_id: SECOND_TAB.id,
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              createTimeFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            ],
          }),
        ],
      });
      const TAB_SLUG_MAP = tabSlugMap(targetDashboard);

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);

      await openClickBehaviorSidebar(page);
      await aside(page).getByText(COUNT_COLUMN_NAME, { exact: true }).click();
      await addDashboardDestination(page);
      const tabSelect = aside(page).getByLabel("Select a dashboard tab");
      await expect(tabSelect).toHaveValue(FIRST_TAB.name);
      await tabSelect.click();
      await page
        .getByRole("listbox")
        .getByText(SECOND_TAB.name, { exact: true })
        .click();
      await expect(
        aside(page).getByText("No available targets", { exact: true }),
      ).toHaveCount(0);
      await addTextParameter(page);

      await icon(page, "chevronleft").click();

      await expect(getCountToDashboardMapping(page)).toBeVisible();
      await expect(getDashboardCard(page).getByRole("button")).toHaveText(
        "1 column has custom behavior",
      );

      await aside(page).getByRole("button", { name: "Done" }).click();
      await saveDashboard(page);

      const countCell = getTableCell(page, COLUMN_INDEX.COUNT);
      await expect(countCell).toHaveText(String(POINT_COUNT));
      await countCell.click();
      await expectFilterWidgets(page, 2, POINT_COUNT);

      const tabParam = `tab=${TAB_SLUG_MAP[SECOND_TAB.name]}`;
      const textFilterParam = `${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}`;
      const timeFilterParam = `${DASHBOARD_FILTER_TIME.slug}=`;
      await expectLocation(page, {
        pathname: `/dashboard/${targetDashboard.id}`,
        search: `?${textFilterParam}&${timeFilterParam}&${tabParam}`,
      });
    });

    test("should allow setting URL as custom destination and updating dashboard filters for different columns", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, TARGET_QUESTION);
      await createDashboard(mb.api, {
        ...TARGET_DASHBOARD,
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
        dashcards: [
          createMockDashboardCard({
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              createTimeFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            ],
          }),
        ],
      });
      const dashcard = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashcard.dashboard_id,
        card_id: dashcard.card_id,
        card: {
          parameter_mappings: [
            createTextFilterMapping({ card_id: dashcard.card_id }),
          ],
        },
      });
      await visitDashboard(page, mb.api, dashcard.dashboard_id);
      const originalPathname = new URL(page.url()).pathname;

      await editDashboard(page);

      await openClickBehaviorSidebar(page);

      // update dashboard filters behavior for 'Count' column
      await expect(getCountToDashboardFilterMapping(page)).toHaveCount(0);
      await aside(page).getByText(COUNT_COLUMN_NAME, { exact: true }).click();
      await aside(page)
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await addTextParameter(page);
      await expect(aside(page).getByRole("textbox")).toHaveCount(0);

      await icon(page, "chevronleft").click();

      await expect(getCountToDashboardFilterMapping(page)).toBeVisible();

      await expect(getDashboardCard(page).getByRole("button")).toHaveText(
        "1 column has custom behavior",
      );

      // custom destination (URL) behavior for 'Created At' column
      await expect(getCreatedAtToUrlMapping(page)).toHaveCount(0);
      await aside(page)
        .getByText(CREATED_AT_COLUMN_NAME, { exact: true })
        .click();
      await addUrlDestination(page);
      const dialog = modal(page);
      await dialog.getByRole("textbox").nth(0).fill(URL_WITH_PARAMS);
      const customLinkTextInput = dialog.getByRole("textbox").nth(1);
      await customLinkTextInput.fill(
        `Created at: {{${CREATED_AT_COLUMN_ID}}}`,
      );
      await customLinkTextInput.blur();
      await dialog.getByRole("button", { name: "Done" }).click();

      await icon(page, "chevronleft").click();

      await expect(getCreatedAtToUrlMapping(page)).toBeVisible();

      await expect(getDashboardCard(page).getByRole("button")).toHaveText(
        "2 columns have custom behavior",
      );

      await aside(page).getByRole("button", { name: "Done" }).click();
      await saveDashboard(page);

      // it handles 'Count' column click
      await getTableCell(page, COLUMN_INDEX.COUNT).click();
      await expectFilterWidgets(page, 1, POINT_COUNT);
      await expectLocation(page, {
        pathname: originalPathname,
        search: `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}`,
      });

      // it handles 'Created at' column click
      await page
        .getByRole("button", { name: DASHBOARD_FILTER_TEXT.name })
        .click();
      const paramPopover = dashboardParametersPopover(page);
      await removeFieldValuesValue(paramPopover, 0);
      await paramPopover
        .getByPlaceholder("Search the list")
        .pressSequentially("Dell Adams");
      await paramPopover
        .getByRole("button", { name: "Update filter" })
        .click();

      await captureNextAnchorClick(page);
      const createdAtCell = getTableCell(page, COLUMN_INDEX.CREATED_AT);
      await expect(createdAtCell).toHaveText("Created at: October 2026");
      await createdAtCell.click();
      await expectCapturedAnchor(page, {
        href: URL_WITH_FILLED_PARAMS,
        rel: "noopener",
        target: "_blank",
      });
    });
  });

  test.describe("interactive embedding", () => {
    const questionDetails = QUESTION_LINE_CHART;

    test("does not allow opening custom dashboard destination", async ({
      page,
      mb,
    }) => {
      const dashboardDetails = {
        enable_embedding: true,
        embedding_params: {},
      };

      const { id: targetDashboardId } = await createDashboard(mb.api, {
        ...TARGET_DASHBOARD,
        enable_embedding: true,
        embedding_params: {},
      });
      const card = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: card.dashboard_id,
        card_id: card.card_id,
        card: {
          id: card.id,
          visualization_settings: {
            click_behavior: {
              parameterMapping: {},
              targetId: targetDashboardId,
              linkType: "dashboard",
              type: "link",
            },
          },
        },
      });

      const dashboardLoaded = waitForEmbedDashboard(page);
      const cardQueryLoaded = waitForEmbedCardQuery(page);
      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: card.dashboard_id },
        params: {},
      });
      await dashboardLoaded;
      await cardQueryLoaded;

      const originalUrl = page.url();
      await clickLineChartPoint(page);
      await expect(
        page
          .locator("header")
          .getByText(TARGET_DASHBOARD.name, { exact: true }),
      ).toHaveCount(0);
      expect(page.url()).toBe(originalUrl);
    });

    test("does not allow opening custom question destination", async ({
      page,
      mb,
    }) => {
      const dashboardDetails = {
        enable_embedding: true,
        embedding_params: {},
      };

      const { id: targetQuestionId } = await createQuestion(mb.api, {
        ...TARGET_QUESTION,
        enable_embedding: true,
        embedding_params: {},
      });
      const card = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: card.dashboard_id,
        card_id: card.card_id,
        card: {
          id: card.id,
          visualization_settings: {
            click_behavior: {
              parameterMapping: {},
              targetId: targetQuestionId,
              linkType: "question",
              type: "link",
            },
          },
        },
      });

      const dashboardLoaded = waitForEmbedDashboard(page);
      const cardQueryLoaded = waitForEmbedCardQuery(page);
      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: card.dashboard_id },
        params: {},
      });
      await dashboardLoaded;
      await cardQueryLoaded;

      const originalUrl = page.url();
      await clickLineChartPoint(page);
      await expect(
        page.locator("header").getByText(TARGET_QUESTION.name, {
          exact: true,
        }),
      ).toHaveCount(0);
      expect(page.url()).toBe(originalUrl);
    });

    test("allows opening custom URL destination with parameters", async ({
      page,
      mb,
    }) => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT],
        enable_embedding: true,
        embedding_params: {
          [DASHBOARD_FILTER_TEXT.slug]: "enabled",
        },
      };

      const dashCard = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashCard.dashboard_id,
        card_id: dashCard.card_id,
        card: {
          id: dashCard.id,
          parameter_mappings: [
            createTextFilterMapping({ card_id: dashCard.card_id }),
          ],
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "url",
              linkTemplate: URL_WITH_PARAMS,
            },
          },
        },
      });

      const dashboardLoaded = waitForEmbedDashboard(page);
      const cardQueryLoaded = waitForEmbedCardQuery(page);
      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashCard.dashboard_id },
        params: {},
      });
      await dashboardLoaded;
      await cardQueryLoaded;

      await page
        .getByRole("button", { name: DASHBOARD_FILTER_TEXT.name })
        .click();
      const paramPopover = dashboardParametersPopover(page);
      await paramPopover
        .getByPlaceholder("Search the list")
        .pressSequentially("Dell Adams");
      await paramPopover.getByRole("button", { name: "Add filter" }).click();

      await captureNextAnchorClick(page);
      await clickLineChartPoint(page);
      await expectCapturedAnchor(page, {
        href: URL_WITH_FILLED_PARAMS,
        rel: "noopener",
        target: "_blank",
      });
    });

    test("allows opening custom URL destination that is not a Metabase instance URL using link (metabase#33379)", async ({
      page,
      mb,
    }) => {
      // The Cypress spec hard-codes localhost:4000; under per-worker backends
      // the instance URL is mb.baseUrl, so build the same protocol/subpath
      // mismatch from it.
      await mb.api.updateSetting(
        "site-url",
        `${mb.baseUrl.replace(/^http:/, "https:")}/subpath`,
      );
      const dashboardDetails = {
        enable_embedding: true,
      };

      const metabaseInstanceUrl = mb.baseUrl;
      const card = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: card.dashboard_id,
        card_id: card.card_id,
        card: {
          id: card.id,
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "url",
              linkTemplate: `${metabaseInstanceUrl}/404`,
            },
          },
        },
      });

      const dashboardLoaded = waitForEmbedDashboard(page);
      const cardQueryLoaded = waitForEmbedCardQuery(page);
      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: card.dashboard_id },
        params: {},
      });
      await dashboardLoaded;
      await cardQueryLoaded;

      await clickLineChartPoint(page);

      // This is app 404 page, the embed 404 page will have different copy
      await expect(
        page
          .getByRole("main")
          .getByText("The page you asked for couldn't be found.", {
            exact: true,
          }),
      ).toBeVisible();
    });

    test("allows updating multiple dashboard filters", async ({
      page,
      mb,
    }) => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
        enable_embedding: true,
        embedding_params: {
          [DASHBOARD_FILTER_TEXT.slug]: "enabled",
          [DASHBOARD_FILTER_TIME.slug]: "enabled",
        },
      };
      const countParameterId = "1";
      const createdAtParameterId = "2";

      const dashCard = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashCard.dashboard_id,
        card_id: dashCard.card_id,
        card: {
          id: dashCard.id,
          parameter_mappings: [
            createTextFilterMapping({ card_id: dashCard.card_id }),
            createTimeFilterMapping({ card_id: dashCard.card_id }),
          ],
          visualization_settings: {
            click_behavior: {
              type: "crossfilter",
              parameterMapping: {
                [countParameterId]: {
                  source: COUNT_COLUMN_SOURCE,
                  target: { type: "parameter", id: countParameterId },
                  id: countParameterId,
                },
                [createdAtParameterId]: {
                  source: CREATED_AT_COLUMN_SOURCE,
                  target: { type: "parameter", id: createdAtParameterId },
                  id: createdAtParameterId,
                },
              },
            },
          },
        },
      });

      const dashboardLoaded = waitForEmbedDashboard(page);
      const cardQueryLoaded = waitForEmbedCardQuery(page);
      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashCard.dashboard_id },
        params: {},
      });
      await dashboardLoaded;
      await cardQueryLoaded;

      await clickLineChartPoint(page);
      await expectFilterWidgets(
        page,
        2,
        POINT_COUNT,
        POINT_CREATED_AT_FORMATTED,
      );
    });
  });

  test.describe("static embedding", () => {
    test("should navigate to public link URL (metabase#38640)", async ({
      page,
      mb,
    }) => {
      const { id: publicDashboardId } = await createDashboard(
        mb.api,
        TARGET_DASHBOARD,
      );
      // create a public link for this dashboard
      const publicLinkResponse = await mb.api.post(
        `/api/dashboard/${publicDashboardId}/public_link`,
      );
      const { uuid } = (await publicLinkResponse.json()) as { uuid: string };

      const dashCard = await createQuestionAndDashboard(mb.api, {
        dashboardDetails: {
          name: "Dashboard",
          enable_embedding: true,
        },
        questionDetails: QUESTION_LINE_CHART,
        cardDetails: {
          // Set custom URL click behavior via API. The Cypress spec
          // hard-codes localhost:4000 — use this worker's backend instead.
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "url",
              linkTemplate: `${mb.baseUrl}/public/dashboard/${uuid}`,
            },
          },
        },
      });

      await visitDashboard(page, mb.api, dashCard.dashboard_id);

      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "dashboard",
        resourceId: dashCard.dashboard_id,
        unpublishBeforeOpen: false,
      });

      const { frame } = await visitIframe(page, mb);
      await clickLineChartPoint(page, frame);

      await expect(
        frame.getByRole("heading", { name: TARGET_DASHBOARD.name }),
      ).toBeVisible();
    });
  });

  test.describe("multi-stage questions as target destination", () => {
    const questionDetails = {
      name: "Table",
      query: {
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
          ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          [
            "field",
            PEOPLE.LONGITUDE,
            {
              "base-type": "type/Float",
              binning: {
                strategy: "default",
              },
              "source-field": ORDERS.USER_ID,
            },
          ],
        ],
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const targetQuestion = {
      name: "Target question",
      query: createMultiStageQuery(),
    };

    test("should allow navigating to questions with filters applied in every stage", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, targetQuestion);
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);

      await editDashboard(page);
      await openClickBehaviorSidebar(page);

      await aside(page)
        .getByText(CREATED_AT_COLUMN_NAME, { exact: true })
        .click();
      await addSavedQuestionDestination(page);

      await verifyAvailableClickTargetColumns(page, [
        // 1st stage - Orders
        "ID",
        "User ID",
        "Product ID",
        "Subtotal",
        "Tax",
        "Total",
        "Discount",
        "Created At",
        "Quantity",
        // 1st stage - Custom columns
        "Net",
        // 1st stage - Reviews #1 (explicit join)
        "Reviews - Product → ID",
        "Reviews - Product → Product ID",
        "Reviews - Product → Reviewer",
        "Reviews - Product → Rating",
        "Reviews - Product → Body",
        "Reviews - Product → Created At",
        // 1st stage - Products (implicit join with Orders)
        "Product → ID",
        "Product → Ean",
        "Product → Title",
        "Product → Category",
        "Product → Vendor",
        "Product → Price",
        "Product → Rating",
        "Product → Created At",
        // 1st stage - People (implicit join with Orders)
        "User → ID",
        "User → Address",
        "User → Email",
        "User → Password",
        "User → Name",
        "User → City",
        "User → Longitude",
        "User → State",
        "User → Source",
        "User → Birth Date",
        "User → Zip",
        "User → Latitude",
        "User → Created At",
        // 1st stage - Products (implicit join with Reviews)
        "Product → ID",
        "Product → Ean",
        "Product → Title",
        "Product → Category",
        "Product → Vendor",
        "Product → Price",
        "Product → Rating",
        "Product → Created At",
        // 1st stage - Aggregations & breakouts
        "Created At: Month",
        "Product → Category",
        "User → Created At: Year",
        "Count",
        "Sum of Total",
        // 2nd stage - Custom columns
        "5 * Count",
        // 2nd stage - Reviews #2 (explicit join)
        "Reviews - Created At: Month → ID",
        "Reviews - Created At: Month → Product ID",
        "Reviews - Created At: Month → Reviewer",
        "Reviews - Created At: Month → Rating",
        "Reviews - Created At: Month → Body",
        "Reviews - Created At: Month → Created At",
        // 2nd stage - Aggregations & breakouts
        "Product → Category",
        "Reviews - Created At: Month → Created At",
        "Count",
        "Sum of Reviews - Created At: Month → Rating",
      ]);

      // 1st stage - Orders
      await getClickMapping(page, "ID").click();
      await popover(page).getByText("ID", { exact: true }).click();

      // 1st stage - Custom columns
      await getClickMapping(page, "Net").click();
      await popover(page)
        .getByText("User → Longitude: 10°", { exact: true })
        .click();

      // 1st stage - Reviews #1 (explicit join)
      await getClickMapping(page, "Reviews - Product → Reviewer").click();
      await popover(page)
        .getByText("Product → Category", { exact: true })
        .click();

      // 1st stage - Products (implicit join with Orders)
      await getClickMapping(page, "Product → Title").first().click();
      await popover(page)
        .getByText("Product → Category", { exact: true })
        .click();

      // 1st stage - People (implicit join with Orders)
      await getClickMapping(page, "User → Longitude").click();
      await popover(page)
        .getByText("User → Longitude: 10°", { exact: true })
        .click();

      // 1st stage - Products (implicit join with Reviews)
      await getClickMapping(page, "Product → Vendor").last().click();
      await popover(page)
        .getByText("Product → Category", { exact: true })
        .click();

      // 1st stage - Aggregations & breakouts
      await getClickMapping(page, "Product → Category").nth(2).click();
      await popover(page)
        .getByText("Product → Category", { exact: true })
        .click();

      // 2nd stage - Custom columns
      await getClickMapping(page, "5 * Count").click();
      await popover(page).getByText("Count", { exact: true }).click();

      // 2nd stage - Reviews #2 (explicit join)
      await getClickMapping(
        page,
        "Reviews - Created At: Month → Rating",
      ).click();
      await popover(page).getByText("ID", { exact: true }).click();

      // 2nd stage - Aggregations & breakouts
      await getClickMapping(page, "Count").last().click();
      await popover(page)
        .getByText("User → Longitude: 10°", { exact: true })
        .click();

      await customizeLinkText(
        page,
        `Created at: {{${CREATED_AT_COLUMN_ID}}} - {{count}}`,
      );

      await aside(page).getByRole("button", { name: "Done" }).click();
      await saveDashboard(page);

      const dataset = waitForDataset(page);
      await getDashboardCard(page)
        .getByText("Created at: May 2025 - 1", { exact: true })
        .first()
        .click();
      await dataset;

      await expect.poll(() => new URL(page.url()).pathname).toBe("/question");
      await expect(page.getByTestId("app-bar")).toContainText(
        `Started from ${targetQuestion.name}`,
      );

      // TODO: https://github.com/metabase/metabase/issues/46774
      // queryBuilderMain()
      //   .findByText("There was a problem with your question")
      //   .should("not.exist");
      // queryBuilderMain().findByText("No results").should("be.visible");

      await openNotebook(page);
      await verifyNotebookQuery(page, "Orders", [
        {
          joins: [
            {
              lhsTable: "Orders",
              rhsTable: "Reviews",
              type: "left-join",
              conditions: [
                {
                  operator: "=",
                  lhsColumn: "Product ID",
                  rhsColumn: "Product ID",
                },
              ],
            },
          ],
          expressions: ["Net"],
          filters: [
            "Product → Title is Doohickey",
            "Reviews - Product → Reviewer is Doohickey",
            "Product → Vendor is Doohickey",
            "ID is 7021",
            "User → Longitude is equal to -80",
            "Net is equal to -80",
          ],
          aggregations: ["Count", "Sum of Total"],
          breakouts: [
            "Created At: Month",
            "Product → Category",
            "User → Created At: Year",
          ],
        },
        {
          joins: [
            {
              lhsTable: "Orders",
              rhsTable: "Reviews",
              type: "left-join",
              conditions: [
                {
                  operator: "=",
                  lhsColumn: "Created At: Month",
                  rhsColumn: "Created At: Month",
                },
              ],
            },
          ],
          expressions: ["5 * Count"],
          filters: [
            "5 * Count is equal to 1",
            "Reviews - Created At: Month → Rating is equal to 7021",
            "Product → Category is Doohickey",
          ],
          aggregations: ["Count", "Sum of Reviews - Created At: Month → Rating"],
          breakouts: [
            "Product → Category",
            "Reviews - Created At: Month → Created At",
          ],
        },
        {
          filters: ["Count is equal to -80"],
        },
      ]);
    });
  });

  test("should navigate to a different tab on the same dashboard when configured (metabase#39319)", async ({
    page,
    mb,
  }) => {
    const TAB_1 = {
      id: 1,
      name: "first-tab",
    };
    const TAB_2 = {
      id: 2,
      name: "second-tab",
    };
    const FILTER_MAPPING_COLUMN = "User ID";
    const DASHBOARD_TEXT_FILTER = {
      id: "1",
      name: "Text filter",
      slug: "filter-text",
      type: "string/contains",
    };

    const dashboard = await createDashboardWithTabsLocal(mb.api, {
      dashboard: {
        name: TARGET_DASHBOARD.name,
        parameters: [{ ...DASHBOARD_TEXT_FILTER }],
      },
      tabs: [TAB_1, TAB_2],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          size_x: 12,
          size_y: 6,
          dashboard_tab_id: TAB_1.id,
          parameter_mappings: [
            createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
          ],
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_BY_YEAR_QUESTION_ID,
          size_x: 12,
          size_y: 6,
          dashboard_tab_id: TAB_2.id,
          parameter_mappings: [
            createTextFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
          ],
        }),
      ],
    });
    const TAB_SLUG_MAP = tabSlugMap(dashboard);
    await visitDashboard(page, mb.api, dashboard.id);

    await editDashboard(page);

    await openClickBehaviorSidebar(page);
    await aside(page).getByText(FILTER_MAPPING_COLUMN, { exact: true }).click();
    await addDashboardDestination(page);
    const tabSelect = aside(page).getByLabel("Select a dashboard tab");
    await expect(tabSelect).toHaveValue(TAB_1.name);
    await tabSelect.click();
    await page
      .getByRole("listbox")
      .getByText(TAB_2.name, { exact: true })
      .click();
    await aside(page)
      .getByText(DASHBOARD_TEXT_FILTER.name, { exact: true })
      .click();
    await popover(page)
      .getByText(FILTER_MAPPING_COLUMN, { exact: true })
      .click();

    await aside(page).getByRole("button", { name: "Done" }).click();
    await saveDashboard(page);

    // test click behavior routing to same dashboard, different tab
    await getTableCell(page, 1).click();
    await expectLocation(page, {
      pathname: `/dashboard/${dashboard.id}`,
      search: `?${DASHBOARD_FILTER_TEXT.slug}=${1}&tab=${TAB_SLUG_MAP[TAB_2.name]}`,
    });
  });

  test("should allow click behavior on left/top header rows on a pivot table (metabase#25203)", async ({
    page,
    mb,
  }) => {
    const QUESTION_NAME = "Cypress Pivot Table";
    const DASHBOARD_NAME = "Pivot Table Dashboard";
    const testQuery = {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PEOPLE.SOURCE,
            { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
          ],
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
        ],
      },
      database: SAMPLE_DB_ID,
    };

    const { dashboard_id: targetDashboardId } =
      await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: QUESTION_NAME,
          query: testQuery.query,
          display: "pivot",
        },
        dashboardDetails: {
          name: DASHBOARD_NAME,
        },
        cardDetails: {
          size_x: 16,
          size_y: 8,
        },
      });
    await visitDashboard(page, mb.api, targetDashboardId);

    await editDashboard(page);

    await openClickBehaviorSidebar(page);
    await addUrlDestination(page);

    const dialog = modal(page);
    await dialog
      .getByRole("textbox")
      .nth(0)
      .fill(
        `${mb.baseUrl}/dashboard/${targetDashboardId}?source={{source}}&category={{category}}&count={{count}}`,
      );
    await dialog.getByRole("button", { name: "Done" }).click();

    await aside(page).getByRole("button", { name: "Done" }).click();

    await saveDashboard(page);

    // test top header row
    await getDashboardCard(page)
      .getByText("Doohickey", { exact: true })
      .click();
    await expectLocation(page, {
      pathname: `/dashboard/${targetDashboardId}`,
      search: "?category=Doohickey&count=&source=",
    });

    // test left header row
    await getDashboardCard(page)
      .getByText("Affiliate", { exact: true })
      .click();
    await expectLocation(page, {
      pathname: `/dashboard/${targetDashboardId}`,
      search: "?category=&count=&source=Affiliate",
    });
  });

  test("should allow click through on the pivot column of a regular table that has been pivoted (metabase#25203)", async ({
    page,
    mb,
  }) => {
    const QUESTION_NAME = "Cypress Table Pivoted";
    const DASHBOARD_NAME = "Table Pivoted Dashboard";
    const testQuery = {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PEOPLE.SOURCE,
            { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
          ],
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
        ],
      },
      database: SAMPLE_DB_ID,
    };

    const { dashboard_id: targetDashboardId } =
      await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: QUESTION_NAME,
          query: testQuery.query,
          display: "table",
        },
        dashboardDetails: {
          name: DASHBOARD_NAME,
        },
        cardDetails: {
          size_x: 16,
          size_y: 8,
        },
      });
    await visitDashboard(page, mb.api, targetDashboardId);

    await editDashboard(page);

    await openClickBehaviorSidebar(page);
    await aside(page).getByText("User → Source", { exact: true }).click();
    await addUrlDestination(page);

    const dialog = modal(page);
    await dialog
      .getByRole("textbox")
      .nth(0)
      .fill(`${mb.baseUrl}/dashboard/${targetDashboardId}?source={{source}}`);
    await dialog.getByRole("button", { name: "Done" }).click();

    await aside(page).getByRole("button", { name: "Done" }).click();

    await saveDashboard(page);

    // test pivoted column
    await getDashboardCard(page).getByText("Organic", { exact: true }).click();
    await expectLocation(page, {
      pathname: `/dashboard/${targetDashboardId}`,
      search: "?source=Organic",
    });
  });

  test("should not pass through null values to filters in custom url click behavior (metabase#25203)", async ({
    page,
    mb,
  }) => {
    const DASHBOARD_NAME = "Click Behavior Custom URL Dashboard";
    const questionDetails = {
      name: "Orders",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["sum", ["field", ORDERS.DISCOUNT, null]],
        ],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        filter: ["=", ["field", ORDERS.USER_ID, null], 1],
      },
      display: "bar",
    };

    const { dashboard_id: targetDashboardId } =
      await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails: {
          name: DASHBOARD_NAME,
        },
        cardDetails: {
          size_x: 16,
          size_y: 8,
        },
      });
    await visitDashboard(page, mb.api, targetDashboardId);

    await editDashboard(page);

    await openClickBehaviorSidebar(page);
    await addUrlDestination(page);

    const dialog = modal(page);
    await dialog
      .getByRole("textbox")
      .nth(0)
      .fill(
        `${mb.baseUrl}/dashboard/${targetDashboardId}?discount={{sum_2}}&total={{sum}}`,
      );
    await dialog.getByRole("button", { name: "Done" }).click();

    await aside(page).getByRole("button", { name: "Done" }).click();

    await saveDashboard(page);

    // test that normal values still work properly
    await getDashboardCard(page)
      .locator('path[fill="#88BF4D"]')
      .nth(2)
      .click();
    await expectLocation(page, {
      pathname: `/dashboard/${targetDashboardId}`,
      search: "?discount=15.070632139056723&total=298.9195210424866",
    });

    // test that null and "empty"s do not get passed through
    await getDashboardCard(page)
      .locator('path[fill="#88BF4D"]')
      .nth(1)
      .click();
    await expectLocation(page, {
      pathname: `/dashboard/${targetDashboardId}`,
      search: "?discount=&total=420.3189231596888",
    });
  });

  test("should navigate to correct dashboard tab via custom destination click behavior (metabase#34447 metabase#44106)", async ({
    page,
    mb,
  }) => {
    const targetDashboard = await createDashboardWithTabsLocal(mb.api, {
      dashboard: { name: TARGET_DASHBOARD.name },
      tabs: [
        {
          id: -1,
          name: "first-tab",
        },
        {
          id: -2,
          name: "second-tab",
        },
      ],
    });

    const baseClickBehavior = {
      type: "link",
      linkType: "dashboard",
      targetId: targetDashboard.id,
      parameterMapping: {},
    };

    const [firstTab, secondTab] = targetDashboard.tabs;

    const { id: dashboardId } = await createDashboard(mb.api, {
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          size_x: 12,
          size_y: 6,
          visualization_settings: {
            click_behavior: {
              ...baseClickBehavior,
              tabId: firstTab.id,
            },
          },
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_QUESTION_ID,
          size_x: 12,
          size_y: 6,
          visualization_settings: {
            click_behavior: {
              ...baseClickBehavior,
              tabId: secondTab.id,
            },
          },
        }),
      ],
    });
    await visitDashboard(page, mb.api, dashboardId);

    await getDashboardCard(page, 1).getByText("14", { exact: true }).click();
    await expectLocation(page, {
      pathname: `/dashboard/${targetDashboard.id}`,
      search: `?tab=${secondTab.id}-second-tab`,
    });

    await page.goBack();
    await expectLocation(page, {
      pathname: `/dashboard/${dashboardId}`,
      search: "",
    });

    await getDashboardCard(page, 0).getByText("14", { exact: true }).click();
    await expectLocation(page, {
      pathname: `/dashboard/${targetDashboard.id}`,
      search: `?tab=${firstTab.id}-first-tab`,
    });
  });

  test("should handle redirect to a dashboard with a filter, when filter was removed (metabase#35444)", async ({
    page,
    mb,
  }) => {
    const questionDetails = QUESTION_LINE_CHART;
    const { id: targetDashboardId } = await createDashboard(mb.api, {
      ...TARGET_DASHBOARD,
      parameters: [DASHBOARD_FILTER_TEXT],
    });
    await mb.api.put(`/api/dashboard/${targetDashboardId}`, {
      dashcards: [
        createMockDashboardCard({
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
          ],
        }),
      ],
    });

    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails,
    });
    await visitDashboard(page, mb.api, dashboard_id);

    await editDashboard(page);

    await openClickBehaviorSidebar(page);
    await addDashboardDestination(page);
    await getClickMapping(page, "Text filter").click();

    await popover(page).getByText("Count", { exact: true }).click();
    await saveDashboard(page);

    // remove filter from the target dashboard
    await mb.api.put(`/api/dashboard/${targetDashboardId}`, {
      parameters: [],
    });

    // reload source dashboard to apply removed filter of target dashboard in
    // the mappings
    await page.reload();

    await editDashboard(page);

    await openClickBehaviorSidebar(page);

    await expect(aside(page)).toContainText("No available targets");
    await aside(page).getByRole("button", { name: "Done" }).click();

    await saveDashboard(page);

    await clickLineChartPoint(page);

    await expect(page.getByTestId("dashboard-header")).toContainText(
      TARGET_DASHBOARD.name,
    );

    // search shouldn't contain `undefined=`
    await expectLocation(page, {
      pathname: `/dashboard/${targetDashboardId}`,
      search: "",
    });
  });

  test("should allow to map numeric columns to user attributes", async ({
    page,
    mb,
  }) => {
    // set user attributes
    await mb.api.put(`/api/user/${NORMAL_USER_ID}`, {
      login_attributes: { attr_uid: NORMAL_USER_ID },
    });

    // setup a click behavior
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await getDashboardCard(page).hover();
    await getDashboardCard(page).getByLabel("Click behavior").click();
    await sidebar(page).getByText("Product ID", { exact: true }).click();
    await sidebar(page)
      .getByText("Go to a custom destination", { exact: true })
      .click();
    await sidebar(page).getByText("Saved question", { exact: true }).click();
    await entityPickerModal(page)
      .getByText("Orders", { exact: true })
      .click();
    await page
      .getByTestId("click-mappings")
      .getByText("Product ID", { exact: true })
      .click();
    await popover(page).getByText("attr_uid", { exact: true }).click();
    await saveDashboard(page);

    // login as a user with a user attribute and ad-hoc query access
    await mb.signInAsNormalUser();

    // visit the dashboard and click on a cell with the click behavior
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    const dataset = waitForDataset(page);
    await getDashboardCard(page).getByText("123", { exact: true }).click();
    await dataset;
    await expect(
      queryBuilderFiltersPanel(page).getByText(
        `Product ID is ${NORMAL_USER_ID}`,
        { exact: true },
      ),
    ).toBeVisible();
  });
});
