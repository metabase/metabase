/**
 * Playwright port of e2e/test/scenarios/dashboard/dashboard-reproductions.cy.spec.js
 *
 * Port notes:
 * - cy.clock()/cy.tick() (issues 12578, 28756) → page.clock.install() +
 *   page.clock.runFor(). runFor is the cy.tick equivalent: both fire every
 *   due timer. page.clock.fastForward fires due timers AT MOST ONCE, which
 *   silently under-drives counter-style intervals (see issue 12578).
 *   The upstream "cy.tick() to let the header load" hack is unnecessary.
 * - The AbortController spy (issue 12926) becomes a page.evaluate that
 *   wraps AbortController.prototype.abort on the live window — the same
 *   post-load timing as the cy.window()+cy.spy original.
 * - res.setDelay / res.setThrottle intercepts → gateResponses (hold until
 *   released) and delayResponses (fixed delay) in support/dashboard-repros.
 * - cy.get("@alias.all").should("have.length", n) → trackResponses /
 *   gateResponses counters.
 * - Issue 46337 is @skip-tagged upstream (unskip when metabase#46337 is
 *   fixed) → test.skip declaration here.
 * - Issue 29076 needs the pro-self-hosted token (sandboxing) → gated on
 *   resolveToken like the other EE ports.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { MetabaseApi, resolveToken } from "../support/api";
import {
  dashboardHeader,
  editBar,
  editDashboard,
  filterWidget,
  getDashboardCard,
  modal,
  saveDashboard,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { icon, inputWithValue, showDashboardCardActions } from "../support/dashboard-cards";
import {
  createDashboardWithCards,
  createDashboardWithTabs,
  createNewTab,
  getDashboardCards,
  getTextCardDetails,
  removeDashboardCard,
} from "../support/dashboard-core";
import {
  addTextBox,
  closeDashboardInfoSidebar,
  openDashboardInfoSidebar,
} from "../support/dashboard-management";
import {
  // handles the auto_apply_filters flag POST /api/dashboard rejects
  createDashboard as createDashboardWithFlags,
  goToTab,
  mockParameter,
  undo,
} from "../support/dashboard-parameters";
import {
  ALL_USERS_GROUP,
  CARD_QUERY_PATH,
  COLLECTION_GROUP,
  DASHCARD_QUERY_PATH,
  addParameterMappingToFirstDashcard,
  assertTabSelected,
  clickBehaviorSidebar,
  closeDashboardSettingsSidebar,
  countOpaqueElements,
  delayResponses,
  gateResponses,
  isDashcardQueryResponse,
  openDashboardSettingsSidebar,
  sandboxTable,
  updatePermissionsGraph,
  waitForDashcardQuery,
} from "../support/dashboard-repros";
import { createMockDashboardCard } from "../support/click-behavior";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { dashboardGrid } from "../support/drillthroughs";
import { createSegment } from "../support/filter-bulk";
import {
  createDashboard,
  createDashboardWithQuestions,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
  dashboardParameterSidebar,
  editDashboardCard,
  trackResponses,
  updateDashboardCards,
  waitForResponseMatching,
} from "../support/filters-repros";
import { cartesianChartCircles, undoToast } from "../support/metrics";
import {
  assertQueryBuilderRowCount,
  entityPickerModal,
  viewFooter,
} from "../support/notebook";
import { ORDERS_COUNT_QUESTION_ID } from "../support/organization";
import { dashboardCards } from "../support/question-saved";
import { openQuestionsSidebar, openRevisionHistory, sidesheet } from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { createCollection } from "../support/search";
import {
  appBar,
  navigationSidebar,
  newButton,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

// From frontend/src/metabase/dashboard/constants.ts.
const DASHBOARD_SLOW_TIMEOUT = 15 * 1000;

function capitalize(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const ORDERS_QUESTION = {
  name: "Orders question",
  query: {
    "source-table": ORDERS_ID,
  },
};

test.describe("issue 12578", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not fetch cards that are still loading when refreshing", async ({
    page,
    mb,
  }) => {
    await page.clock.install();
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: ORDERS_QUESTION,
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await page.getByLabel("Auto Refresh").click();
    await popover(page).getByText("1 minute", { exact: true }).click();

    // Hold all subsequent dashcard queries in flight (the upstream
    // res.setDelay(99999) intercept).
    const gate = await gateResponses(page, DASHCARD_QUERY_PATH);

    // runFor, not fastForward: the refresh is driven by a 1s interval that
    // increments a counter (useDashboardRefreshPeriod), so it needs all 61
    // firings to reach the 60s period. fastForward fires due timers at most
    // once — the Sinon/cy.tick equivalent is runFor.
    await page.clock.runFor(61 * 1000);
    await page.clock.runFor(61 * 1000);

    // Two refresh ticks, but only one query: the second tick must not
    // re-fetch a card whose query is still loading.
    await expect.poll(() => gate.count()).toBe(1);
    await page.waitForTimeout(500);
    expect(gate.count()).toBe(1);
  });
});

test.describe("issue 61013", () => {
  const dashboardName = "Dashboard 61013";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await createDashboardWithTabs(mb.api, {
      name: dashboardName,
      tabs: [
        { id: 1, name: "Tab 1" },
        { id: 2, name: "Tab 2" },
      ],
    });
  });

  async function addCurrentQuestionToDashboard(page: Page) {
    await page.getByLabel("Move, trash, and more…").click();
    await popover(page).getByText("Add to dashboard", { exact: true }).click();

    const picker = entityPickerModal(page);
    await picker
      .getByPlaceholder("Search…", { exact: true })
      .pressSequentially(dashboardName);
    await picker.getByText(dashboardName, { exact: true }).click();
    await page.getByTestId("entity-picker-select-button").click();
  }

  test("should only add one card and save correctly to the dashboard when the dashboard is empty but has multiple tabs (metabase#61013)", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion(ORDERS_QUESTION);
    await visitQuestion(page, id);

    await addCurrentQuestionToDashboard(page);

    await expect(getDashboardCards(page)).toHaveCount(1);
    await expect(
      getDashboardCard(page, 0).getByText("Orders question", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 0).getByText("Showing first 2,000 rows", {
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      editBar(page).getByText("You're editing this dashboard.", {
        exact: true,
      }),
    ).toBeVisible();

    await saveDashboard(page);

    await expect(getDashboardCards(page)).toHaveCount(1);
    await expect(
      getDashboardCard(page, 0).getByText("Orders question", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 0).getByText("Showing first 2,000 rows", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should not wait for cards to load before switching to edit mode", async ({
    page,
    mb,
  }) => {
    // slowDownCardQuery: hold /api/card/:id/query forever (upstream delays
    // by 300s, longer than any test).
    await gateResponses(page, CARD_QUERY_PATH);

    // visitQuestion waits for the query, which we don't want here.
    const { id } = await mb.api.createQuestion(ORDERS_QUESTION);
    await page.goto(`/question/${id}`);

    await addCurrentQuestionToDashboard(page);

    await expect(
      editBar(page).getByText("You're editing this dashboard.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 0).getByTestId("loading-indicator"),
    ).toBeVisible();
  });
});

test.describe("issue 12926", () => {
  const filterDisplayName = "F";
  const queryResult = 42;
  const parameterValue = 10;
  const questionDetails = {
    name: "Question 1",
    native: {
      query: `SELECT ${queryResult} [[+{{F}}]] as ANSWER`,
      "template-tags": {
        F: {
          type: "number",
          name: "F",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": filterDisplayName,
        },
      },
    },
  };

  async function removeCard(page: Page) {
    await editDashboard(page);
    await removeDashboardCard(page);
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("card removal while query is in progress", () => {
    test("should stop the ongoing query when removing a card from a dashboard", async ({
      page,
      mb,
    }) => {
      await delayResponses(page, DASHCARD_QUERY_PATH, 5000);

      const dashcard = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await page.goto(`/dashboard/${dashcard.dashboard_id}`);

      // The query is deliberately slowed, so it is still in-flight here.
      // The API client uses fetch, so cancelling the query aborts its
      // AbortController (the upstream cy.spy on abort).
      await page.evaluate(() => {
        const original = AbortController.prototype.abort;
        (window as unknown as { __abortCalls: number }).__abortCalls = 0;
        AbortController.prototype.abort = function (
          ...args: Parameters<typeof original>
        ) {
          (window as unknown as { __abortCalls: number }).__abortCalls += 1;
          return original.apply(this, args);
        };
      });

      await removeCard(page);

      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as { __abortCalls: number }).__abortCalls,
          ),
        )
        .toBeGreaterThan(0);
    });

    test("should re-fetch the query when doing undo on the removal", async ({
      page,
      mb,
    }) => {
      const stopDelaying = await delayResponses(
        page,
        DASHCARD_QUERY_PATH,
        5000,
      );

      const dashcard = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await page.goto(`/dashboard/${dashcard.dashboard_id}`);

      await removeCard(page);

      await stopDelaying();

      const refetch = waitForDashcardQuery(page);
      await undo(page);
      await refetch;

      await expect(
        getDashboardCard(page).getByText(String(queryResult), { exact: true }),
      ).toBeVisible();
    });

    test("should not break virtual cards (metabase#35545)", async ({
      page,
      mb,
    }) => {
      const { id } = await createDashboard(mb.api);
      await visitDashboard(page, mb.api, id);

      await addTextBox(page, "Text card content");

      await removeDashboardCard(page);

      await undo(page);

      await expect(
        getDashboardCard(page).getByText("Text card content", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("saving a dashboard that retriggers a non saved query (negative id)", () => {
    test("should load the card with correct parameters after save", async ({
      page,
      mb,
    }) => {
      await createNativeQuestion(mb.api, questionDetails);

      const { id } = await createDashboard(mb.api);
      await visitDashboard(page, mb.api, id);

      await editDashboard(page);

      await openQuestionsSidebar(page);
      await sidebar(page)
        .getByText(questionDetails.name, { exact: true })
        .click();

      await setFilter(page, "Number", "Equal to");
      await sidebar(page).getByText("No default", { exact: true }).click();
      await popover(page)
        .getByPlaceholder("Enter a number", { exact: true })
        .fill(String(parameterValue));
      await popover(page).getByText("Add filter", { exact: true }).click();

      await getDashboardCard(page).getByText("Select…", { exact: true }).click();
      // cy .contains(...).eq(0) — first match.
      await popover(page)
        .getByText(filterDisplayName, { exact: true })
        .first()
        .click();

      await saveDashboard(page);

      await expect(
        getDashboardCard(page).getByText(String(queryResult + parameterValue), {
          exact: true,
        }),
      ).toBeVisible();
    });
  });
});

test.describe("issue 13736", () => {
  const questionDetails = {
    name: "Orders count",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should work even if some cards are broken (metabase#13736)", async ({
    page,
    mb,
  }) => {
    const { id: failingQuestionId } = await createQuestion(
      mb.api,
      questionDetails,
    );
    const { id: successfulQuestionId } = await createQuestion(
      mb.api,
      questionDetails,
    );
    const { id: dashboardId } = await createDashboard(mb.api, {
      name: "13736 Dashboard",
    });

    const failingQueryPath = new RegExp(
      `^/api/dashboard/\\d+/dashcard/\\d+/card/${failingQuestionId}/query$`,
    );
    await page.route(
      (url) => failingQueryPath.test(url.pathname),
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            cause: "some error",
            data: {},
            message: "some error",
          }),
        }),
    );

    await updateDashboardCards(mb.api, {
      dashboard_id: dashboardId,
      cards: [
        { card_id: failingQuestionId },
        { card_id: successfulQuestionId, col: 11 },
      ],
    });
    await visitDashboard(page, mb.api, dashboardId);

    await expect(
      getDashboardCards(page)
        .nth(0)
        .getByText("There was a problem displaying this chart.", {
          exact: true,
        }),
    ).toBeVisible();
    await expect(
      getDashboardCards(page).nth(1).getByText("18,760", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 16559", () => {
  const dashboardDetails = {
    name: "16559 Dashboard",
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createDashboard(mb.api, dashboardDetails);
    await visitDashboard(page, mb.api, id);
  });

  function latestRevisionEvent(page: Page) {
    return sidesheet(page)
      .getByTestId("dashboard-history-list")
      .getByTestId("revision-history-event")
      .first();
  }

  test("should always show the most recent revision (metabase#16559)", async ({
    page,
  }) => {
    await openRevisionHistory(page);
    // Dashboard creation
    await expect(
      latestRevisionEvent(page).getByText("You created this.", { exact: true }),
    ).toBeVisible();
    await closeDashboardInfoSidebar(page);

    // Edit dashboard
    await editDashboard(page);
    await openQuestionsSidebar(page);
    const cardQuery = waitForResponseMatching(page, "POST", CARD_QUERY_PATH);
    await sidebar(page).getByText("Orders, Count", { exact: true }).click();
    await cardQuery;
    const savePut = waitForResponseMatching(
      page,
      "PUT",
      /^\/api\/dashboard\/\d+$/,
    );
    await editBar(page).getByRole("button", { name: "Save", exact: true }).click();
    await savePut;

    await openRevisionHistory(page);
    await expect(
      latestRevisionEvent(page).getByText("You added a card.", { exact: true }),
    ).toBeVisible();
    await closeDashboardInfoSidebar(page);

    // Change dashboard name — EditableText: click + type + blur, anchored
    // on the PUT the blur fires.
    const heading = page.getByTestId("dashboard-name-heading");
    await heading.click();
    await heading.press("End");
    await heading.pressSequentially(" modified");
    const renamePut = waitForResponseMatching(
      page,
      "PUT",
      /^\/api\/dashboard\/\d+$/,
    );
    await heading.blur();
    await renamePut;

    await openRevisionHistory(page);
    await expect(
      latestRevisionEvent(page).getByText(
        'You renamed this Dashboard from "16559 Dashboard" to "16559 Dashboard modified".',
        { exact: true },
      ),
    ).toBeVisible();

    // Add description
    const sheet = sidesheet(page);
    await sheet.getByRole("tab", { name: "Overview", exact: true }).click();

    const description = sheet.getByPlaceholder("Add description", {
      exact: true,
    });
    await description.click();
    await description.pressSequentially("16559 description");
    const descriptionPut = waitForResponseMatching(
      page,
      "PUT",
      /^\/api\/dashboard\/\d+$/,
    );
    await description.blur();
    await descriptionPut;

    await sheet.getByRole("tab", { name: "History", exact: true }).click();
    await expect(
      latestRevisionEvent(page).getByText("You added a description.", {
        exact: true,
      }),
    ).toBeVisible();
    await closeDashboardInfoSidebar(page);

    // Toggle auto-apply filters
    await openDashboardSettingsSidebar(page);
    const autoApplyPut = waitForResponseMatching(
      page,
      "PUT",
      /^\/api\/dashboard\/\d+$/,
    );
    // Mantine switch: the input is covered by its styled track.
    await sidesheet(page)
      .getByLabel("Auto-apply filters", { exact: true })
      .click({ force: true });
    await autoApplyPut;
    await closeDashboardSettingsSidebar(page);

    await openRevisionHistory(page);
    await expect(
      latestRevisionEvent(page).getByText(
        "You set auto apply filters to false.",
        { exact: true },
      ),
    ).toBeVisible();
    await closeDashboardInfoSidebar(page);

    // Move dashboard to another collection
    await icon(dashboardHeader(page), "ellipsis").click();
    await popover(page).getByText("Move", { exact: true }).click();
    const picker = entityPickerModal(page);
    await picker.getByText("First collection", { exact: true }).click();
    const movePut = waitForResponseMatching(
      page,
      "PUT",
      /^\/api\/dashboard\/\d+$/,
    );
    await picker.getByRole("button", { name: "Move", exact: true }).click();
    await movePut;

    await openRevisionHistory(page);
    await expect(
      latestRevisionEvent(page).getByText(
        "You moved this Dashboard to First collection.",
        { exact: true },
      ),
    ).toBeVisible();
  });
});

test.describe("issue 17879", () => {
  async function setupDashcardAndDrillToQuestion(
    page: Page,
    api: MetabaseApi,
    {
      sourceDateUnit,
      expectedFilterText,
      targetDateUnit = "default",
    }: {
      sourceDateUnit: string;
      expectedFilterText: string;
      targetDateUnit?: string;
    },
  ) {
    if (targetDateUnit === "default") {
      await createQuestion(api, {
        name: "Q1 - 17879",
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
      });
    } else {
      await createQuestion(api, {
        name: "Q1 - 17879",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": targetDateUnit }],
          ],
          limit: 5,
        },
      });
    }

    const { dashboard } = await createDashboardWithQuestions(api, {
      dashboardDetails: { name: "Dashboard with aggregated Q2" },
      questions: [
        {
          name: "Q2",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": sourceDateUnit }],
            ],
            limit: 5,
          },
        },
      ],
    });

    await visitDashboard(page, api, dashboard.id);
    await editDashboard(page);

    await showDashboardCardActions(page);
    await icon(page.getByTestId("dashboardcard-actions-panel"), "click").click();

    await page.getByText("Go to a custom destination", { exact: true }).click();
    await page.getByText("Saved question", { exact: true }).click();
    await entityPickerModal(page)
      .getByText("Q1 - 17879", { exact: true })
      .click();
    await sidebar(page).getByText("Created At", { exact: true }).click();

    await popover(page)
      .getByText(
        "Created At: " + capitalize(sourceDateUnit.replace(/-/g, " ")),
        { exact: true },
      )
      .click();

    await sidebar(page).getByRole("button", { name: "Done", exact: true }).click();

    await saveDashboard(page);

    // Upstream waits on @getCardQuery here, but that intercept is registered
    // before visitDashboard: saving changes no parameters and fires no new
    // dashcard query, so cy.wait only consumes the initial load's response
    // from the alias backlog and asserts nothing. A faithful waitForResponse
    // hangs for 30s. Dropped — the circle locator below auto-waits for the
    // re-rendered chart, which is what the wait was standing in for.
    // cy: cartesianChartCircle().first().click({ force: true })
    await cartesianChartCircles(page).first().click({ force: true });

    await expect(page).toHaveURL(/\/question/);

    await expect(page.getByTestId("qb-filters-panel")).toHaveText(
      expectedFilterText,
    );
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should map dashcard date parameter to correct date range filter in target question - month -> day (metabase#17879)", async ({
    page,
    mb,
  }) => {
    await setupDashcardAndDrillToQuestion(page, mb.api, {
      sourceDateUnit: "month",
      expectedFilterText: "Created At is Apr 1–30, 2025",
    });
  });

  test("should map dashcard date parameter to correct date range filter in target question - week -> day (metabase#17879)", async ({
    page,
    mb,
  }) => {
    await setupDashcardAndDrillToQuestion(page, mb.api, {
      sourceDateUnit: "week",
      expectedFilterText: "Created At is Apr 27 – May 3, 2025",
    });
  });

  test("should map dashcard date parameter to correct date range filter in target question - year -> day (metabase#17879)", async ({
    page,
    mb,
  }) => {
    await setupDashcardAndDrillToQuestion(page, mb.api, {
      sourceDateUnit: "year",
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2025",
    });
  });

  test("should map dashcard date parameter to correct date range filter in target question - year -> month (metabase#17879)", async ({
    page,
    mb,
  }) => {
    await setupDashcardAndDrillToQuestion(page, mb.api, {
      sourceDateUnit: "year",
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2025",
      targetDateUnit: "month",
    });
  });
});

test.describe("issue 21830", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("slow loading card visualization options click shouldn't lead to error (metabase#21830)", async ({
    page,
  }) => {
    // Hold the dashcard query (the upstream res.setThrottle(100) — the
    // point is that the response hasn't finished when we open edit mode).
    const gate = await gateResponses(page, DASHCARD_QUERY_PATH);

    const getDashboard = waitForResponseMatching(
      page,
      "GET",
      new RegExp(`^/api/dashboard/${ORDERS_DASHBOARD_ID}$`),
    );
    await page.goto(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    await getDashboard;

    // it's crucial that this happens BEFORE the card query response!
    await editDashboard(page);
    await showDashboardCardActions(page);

    const card = getDashboardCard(page);
    await expect(icon(card, "close")).toBeVisible();
    await expect(icon(card, "click")).toHaveCount(0);
    await expect(icon(card, "palette")).toHaveCount(0);

    const cardQuery = waitForDashcardQuery(page);
    gate.release();
    await cardQuery;

    await expect(icon(card, "close")).toBeVisible();
    await expect(icon(card, "click")).toBeVisible();
    await expect(icon(card, "palette")).toBeVisible();
  });
});

test.describe("issue 28756", () => {
  const UNRESTRICTED_COLLECTION_NAME = "Unrestricted collection";
  const RESTRICTED_COLLECTION_NAME = "Restricted collection";

  const ADMIN_GROUP_ID = "2";

  const TOAST_TIMEOUT_SAFETY_MARGIN = 1000;
  const TOAST_TIMEOUT = DASHBOARD_SLOW_TIMEOUT + TOAST_TIMEOUT_SAFETY_MARGIN;
  const TOAST_MESSAGE = "Want to get notified when this dashboard loads?";

  async function restrictCollectionForNonAdmins(
    api: MetabaseApi,
    collectionId: number,
  ) {
    const response = await api.get("/api/collection/graph");
    const { revision, groups } = (await response.json()) as {
      revision: number;
      groups: Record<string, Record<string, string>>;
    };
    await api.put("/api/collection/graph", {
      revision,
      groups: Object.fromEntries(
        Object.entries(groups).map(([groupId, groupPermissions]) => [
          groupId,
          {
            ...groupPermissions,
            [collectionId]: groupId === ADMIN_GROUP_ID ? "write" : "none",
          },
        ]),
      ),
    });
  }

  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const restrictedCollection = await createCollection(mb.api, {
      name: RESTRICTED_COLLECTION_NAME,
    });
    await restrictCollectionForNonAdmins(mb.api, restrictedCollection.id);

    const unrestrictedCollection = await createCollection(mb.api, {
      name: UNRESTRICTED_COLLECTION_NAME,
    });
    const dashcard = await createQuestionAndDashboard(mb.api, {
      dashboardDetails: {
        collection_id: unrestrictedCollection.id,
      },
      questionDetails: {
        name: "28756 Question",
        query: {
          "source-table": PRODUCTS_ID,
        },
        collection_id: restrictedCollection.id,
      },
    });
    dashboardId = dashcard.dashboard_id;
  });

  test("should not show a toast to enable notifications to user with no permissions to see the card (metabase#28756)", async ({
    page,
    mb,
  }) => {
    await mb.signInAsNormalUser();
    await page.clock.install();

    await visitDashboard(page, mb.api, dashboardId);
    await page.clock.runFor(TOAST_TIMEOUT);

    await expect(undoToast(page)).toHaveCount(0);
    await expect(page.getByText(TOAST_MESSAGE, { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 29076", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "needs the pro-self-hosted token (sandboxing)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });
    await sandboxTable(mb.api, {
      table_id: ORDERS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", ORDERS.ID, null]],
      },
    });
    await mb.signInAsSandboxedUser();
  });

  test("should be able to drilldown to a saved question in a dashboard with sandboxing (metabase#29076)", async ({
    page,
    mb,
  }) => {
    const cardQuery = waitForDashcardQuery(page);
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    const cardQueryResponse = await cardQuery;

    // test that user is sandboxed - normal users have over 2000 rows
    await expect(
      getDashboardCard(page).getByTestId("table-body").getByRole("row"),
    ).toHaveCount(1);

    await getDashboardCard(page).getByText("Orders", { exact: true }).click();
    await expect(
      viewFooter(page).getByText("Visualization", { exact: true }),
    ).toBeVisible();
    // test that user is sandboxed - normal users have over 2000 rows
    await assertQueryBuilderRowCount(page, 1);

    // Port of H.assertDatasetReqIsSandboxed on the dashcard query response.
    const body = (await cardQueryResponse.json()) as {
      data: {
        is_sandboxed: boolean;
        cols: { id: number }[];
        rows: unknown[][];
      };
    };
    expect(body.data.is_sandboxed).toBe(true);
    const colIndex = body.data.cols.findIndex(
      (col) => col.id === ORDERS.USER_ID,
    );
    expect(colIndex).toBeGreaterThanOrEqual(0);
    // USERS.sandboxed.login_attributes.attr_uid === "1" (cypress_data.js).
    expect(body.data.rows.every((row) => row[colIndex] === 1)).toBe(true);
  });
});

test.describe("issue 31274", () => {
  const createTextCards = (length: number) => {
    return Array.from({ length }).map((_, index) => {
      return getTextCardDetails({
        size_x: 2,
        size_y: 2,
        row: (length - index - 1) * 2,
        text: `Text ${index + 1}`,
      });
    });
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not clip dashcard actions (metabase#31274)", async ({
    page,
    mb,
  }) => {
    const dashboard = await createDashboardWithCards(mb.api, {
      dashcards: createTextCards(3),
    });

    await visitDashboard(page, mb.api, dashboard.id);
    await editDashboard(page);

    await assertTabSelected(page, "Tab 1");

    await getDashboardCard(page, 1).hover();

    // cy .filter(":visible").should("have.length", 1). Every card renders an
    // actions panel in edit mode; only the hovered one is faded in, so the
    // faithful check is opacity-based (see countOpaqueElements).
    await expect
      .poll(() =>
        countOpaqueElements(page.getByTestId("dashboardcard-actions-panel")),
      )
      .toBe(1);

    // Make sure the click lands, which means the panel is not covered by
    // another element (Playwright's hit-target check enforces this).
    const closeIcon = icon(
      getDashboardCard(page, 1).getByTestId("dashboardcard-actions-panel"),
      "close",
    );
    const box = await closeIcon.boundingBox();
    if (!box) {
      throw new Error("close icon has no bounding box");
    }
    // cy click({ position: "top" }) — top-center of the icon.
    await closeIcon.click({ position: { x: box.width / 2, y: 1 } });

    await expect(page.getByTestId("dashcard")).toHaveCount(2);
  });

  test("renders cross icon on the link card without clipping", async ({
    page,
    mb,
  }) => {
    const { id } = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, id);
    await editDashboard(page);

    await page.getByLabel("Add a link or iframe").click();
    await popover(page).getByText("Link", { exact: true }).click();
    await page.getByPlaceholder("https://example.com").hover();

    // Make sure the click lands, which means the icon is not covered by
    // another element.
    const closeAnchor = page
      .getByTestId("dashboardcard-actions-panel")
      .locator("a")
      .filter({ has: page.locator(".Icon-close") });
    const box = await closeAnchor.boundingBox();
    if (!box) {
      throw new Error("close anchor has no bounding box");
    }
    // cy click({ position: "bottom" }) — bottom-center of the anchor.
    await closeAnchor.click({ position: { x: box.width / 2, y: box.height - 1 } });

    await expect(page.getByTestId("dashcard")).toHaveCount(0);
  });
});

test.describe("issue 31697", () => {
  const segmentDetails = {
    name: "Orders segment",
    description: "All orders with a total under $100.",
    definition: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      filter: ["<", ["field", ORDERS.TOTAL, null], 100],
    },
  };

  const getQuestionDetails = (segment: { id: number }) => ({
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      filter: ["segment", segment.id],
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  });

  let questionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const segment = await createSegment(mb.api, segmentDetails);
    const question = await createQuestion(mb.api, getQuestionDetails(segment));
    questionId = question.id;
  });

  test("should allow x-rays for questions with segments (metabase#31697)", async ({
    page,
  }) => {
    await visitQuestion(page, questionId);
    await cartesianChartCircles(page).first().click();
    await popover(page)
      .getByText("Automatic insights…", { exact: true })
      .click();
    const xrayDashboard = waitForResponseMatching(
      page,
      "GET",
      /^\/api\/automagic-dashboards\//,
    );
    await popover(page).getByText("X-ray", { exact: true }).click();
    await xrayDashboard;

    await expect(
      page.getByRole("main").getByText(/A closer look at number of Orders/),
    ).toBeVisible();
  });
});

test.describe("issue 31766", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not corrupt dashboard data (metabase#31766)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "Orders",
      query: { "source-table": ORDERS_ID, limit: 5 },
    };

    const dashboardDetails = { name: "Orders in a dashboard" };

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
      cardDetails: { size_x: 16, size_y: 8 },
    });

    const textCard = getTextCardDetails({
      row: 0,
      size_x: 24,
      size_y: 1,
      text: "top",
    });
    const questionCard = {
      row: 2,
      size_x: 16,
      size_y: 6,
      id: dashcard.id,
      card_id: dashcard.card_id,
    };

    await updateDashboardCards(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      cards: [textCard, questionCard],
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);
    await editDashboard(page);

    // update text card
    await page.getByTestId("editing-dashboard-text-preview").click();
    await page.keyboard.type("1");

    await saveDashboard(page);

    // visit question
    await page
      .getByTestId("dashcard")
      .nth(1)
      .getByText("Orders", { exact: true })
      .click();

    // Update viz settings
    await viewFooter(page)
      .getByRole("button", { name: "Visualization", exact: true })
      .click();
    await page.getByTestId("Detail-button").click();

    const updateQuestion = waitForResponseMatching(
      page,
      "PUT",
      /^\/api\/card\/\d+$/,
    );
    await queryBuilderHeader(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await updateQuestion;
    await expect(modal(page)).toHaveCount(0);
  });
});

test.describe("issue 34382", () => {
  async function createDashboardWithCards(api: MetabaseApi): Promise<number> {
    const filterDetails = {
      name: "Product Category",
      slug: "category",
      id: "96917421",
      type: "category",
    };

    const { id: dashboard_id } = await createDashboardWithFlags(api, {
      name: "Products in a dashboard",
      auto_apply_filters: false,
      parameters: [filterDetails],
    });
    const { id: question_id } = await createQuestion(api, {
      name: "Products",
      query: { "source-table": PRODUCTS_ID },
    });
    await api.put(`/api/dashboard/${dashboard_id}`, {
      dashcards: [
        {
          id: -1,
          card_id: question_id,
          row: 0,
          col: 0,
          size_x: 8,
          size_y: 8,
          visualization_settings: {},
          parameter_mappings: [
            {
              card_id: question_id,
              parameter_id: filterDetails.id,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
          ],
        },
      ],
    });
    return dashboard_id;
  }

  async function addFilterValue(page: Page, value: string) {
    await filterWidget(page).click();
    await popover(page).getByText(value, { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
  }

  async function applyFilter(page: Page) {
    const dashcardQuery = waitForDashcardQuery(page);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await dashcardQuery;
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should preserve filter value when navigating between the dashboard and the query builder with auto-apply disabled (metabase#34382)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboardWithCards(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    await addFilterValue(page, "Gizmo");
    await applyFilter(page);

    // Navigate to Products question
    await getDashboardCard(page).getByText("Products", { exact: true }).click();

    // Navigate back to dashboard
    await queryBuilderHeader(page)
      .getByLabel("Back to Products in a dashboard")
      .click();

    await expect.poll(() => new URL(page.url()).search).toBe("?category=Gizmo");
    await expect(filterWidget(page)).toContainText("Gizmo");

    // only products with category "Gizmo" are filtered
    await expect(
      getDashboardCard(page)
        .getByTestId("table-body")
        .getByRole("gridcell")
        .nth(3),
    ).toContainText("Gizmo");
  });
});

test.describe("should not redirect users to other pages when linking an entity (metabase#35037)", () => {
  const TEST_DASHBOARD_NAME = "Orders in a dashboard";
  const TEST_QUESTION_NAME = "Question#35037";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not redirect users to recent item", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    const originUrl = page.url();

    await page.getByLabel("Add a link or iframe").click();
    const recentViews = waitForResponseMatching(
      page,
      "GET",
      /^\/api\/activity\/recents$/,
    );
    await popover(page).getByText("Link", { exact: true }).click();
    await recentViews;

    await page
      .getByTestId("recents-list-container")
      .getByText(TEST_DASHBOARD_NAME, { exact: true })
      .click();

    expect(page.url()).toBe(originUrl);

    await expect(page.getByTestId("recents-list-container")).toHaveCount(0);

    await expect(
      page
        .getByTestId("entity-edit-display-link")
        .getByText(TEST_DASHBOARD_NAME, { exact: true }),
    ).toBeVisible();
  });

  test("should not redirect users to search item", async ({ page, mb }) => {
    await createNativeQuestion(mb.api, {
      name: TEST_QUESTION_NAME,
      native: { query: "SELECT 1" },
    });
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    const originUrl = page.url();

    await page.getByLabel("Add a link or iframe").click();
    await popover(page).getByText("Link", { exact: true }).click();
    await page
      .getByTestId("custom-edit-text-link")
      .getByPlaceholder("https://example.com")
      .pressSequentially(TEST_QUESTION_NAME);
    await page
      .getByTestId("search-results-list")
      .getByText(TEST_QUESTION_NAME, { exact: true })
      .click();

    expect(page.url()).toBe(originUrl);

    await expect(page.getByTestId("search-results-list")).toHaveCount(0);

    await expect(
      page
        .getByTestId("entity-edit-display-link")
        .getByText(TEST_QUESTION_NAME, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 39863", () => {
  const TAB_1 = { id: 1, name: "Tab 1" };
  const TAB_2 = { id: 2, name: "Tab 2" };

  const DATE_FILTER = {
    id: "2",
    name: "Date filter",
    slug: "filter-date",
    type: "date/all-options",
  };

  const CREATED_AT_FIELD_REF = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime" },
  ];

  const COMMON_DASHCARD_INFO = {
    card_id: ORDERS_QUESTION_ID,
    parameter_mappings: [
      {
        parameter_id: DATE_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", CREATED_AT_FIELD_REF],
      },
    ],
    size_x: 10,
    size_y: 4,
  };

  const ID_FILTER = { id: "3", name: "ID filter", slug: "filter-id", type: "id" };
  const USER_ID_FILTER = {
    id: "4",
    name: "User ID filter",
    slug: "filter-user-id",
    type: "id",
  };
  const PRODUCT_ID_FILTER = {
    id: "5",
    name: "Product ID filter",
    slug: "filter-product-id",
    type: "id",
  };
  const SUBTOTAL_FILTER = {
    id: "6",
    name: "Subtotal filter",
    slug: "filter-subtotal",
    type: "number/<=",
  };
  const TOTAL_FILTER = {
    id: "7",
    name: "Total filter",
    slug: "filter-total",
    type: "number/<=",
  };
  const TAX_FILTER = {
    id: "8",
    name: "Tax filter",
    slug: "filter-tax",
    type: "number/<=",
  };
  const DISCOUNT_FILTER = {
    id: "9",
    name: "Discount filter",
    slug: "filter-discount",
    type: "number/<=",
  };
  const QUANTITY_FILTER = {
    id: "10",
    name: "Quantity filter",
    slug: "filter-quantity",
    type: "number/<=",
  };

  const ID_FIELD_REF = ["field", ORDERS.ID, { "base-type": "type/BigInteger" }];
  const USER_ID_FIELD_REF = [
    "field",
    ORDERS.USER_ID,
    { "base-type": "type/BigInteger" },
  ];
  const PRODUCT_ID_FIELD_REF = [
    "field",
    ORDERS.PRODUCT_ID,
    { "base-type": "type/BigInteger" },
  ];
  const SUBTOTAL_FIELD_REF = [
    "field",
    ORDERS.SUBTOTAL,
    { "base-type": "type/Float" },
  ];
  const TOTAL_FIELD_REF = ["field", ORDERS.TOTAL, { "base-type": "type/Float" }];
  const TAX_FIELD_REF = ["field", ORDERS.TAX, { "base-type": "type/Float" }];
  const DISCOUNT_FIELD_REF = [
    "field",
    ORDERS.DISCOUNT,
    { "base-type": "type/Float" },
  ];
  const QUANTITY_FIELD_REF = [
    "field",
    ORDERS.QUANTITY,
    { "base-type": "type/Number" },
  ];

  const DASHCARD_WITH_9_FILTERS = {
    card_id: ORDERS_QUESTION_ID,
    parameter_mappings: [
      {
        parameter_id: DATE_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", CREATED_AT_FIELD_REF],
      },
      {
        parameter_id: ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", ID_FIELD_REF],
      },
      {
        parameter_id: USER_ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", USER_ID_FIELD_REF],
      },
      {
        parameter_id: PRODUCT_ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", PRODUCT_ID_FIELD_REF],
      },
      {
        parameter_id: SUBTOTAL_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", SUBTOTAL_FIELD_REF],
      },
      {
        parameter_id: TOTAL_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", TOTAL_FIELD_REF],
      },
      {
        parameter_id: TAX_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", TAX_FIELD_REF],
      },
      {
        parameter_id: DISCOUNT_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", DISCOUNT_FIELD_REF],
      },
      {
        parameter_id: QUANTITY_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", QUANTITY_FIELD_REF],
      },
    ],
    size_x: 10,
    size_y: 4,
  };

  async function setDateFilter(page: Page) {
    await page.getByLabel("Date filter").click();
    await popover(page).getByText(/Previous 12 months/i).click();
  }

  async function assertNoLoadingSpinners(page: Page) {
    await expect(
      dashboardGrid(page).getByTestId("loading-indicator"),
    ).toHaveCount(0);
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  async function runTabSwitchScenario(
    page: Page,
    api: MetabaseApi,
    {
      parameters,
      dashcardTemplate,
    }: {
      parameters: Record<string, unknown>[];
      dashcardTemplate: Record<string, unknown>;
    },
  ) {
    const dashboard = await createDashboardWithTabs(api, {
      tabs: [TAB_1, TAB_2],
      parameters,
      dashcards: [
        createMockDashboardCard({
          ...dashcardTemplate,
          id: -1,
          dashboard_tab_id: TAB_1.id,
        }),
        createMockDashboardCard({
          ...dashcardTemplate,
          id: -2,
          dashboard_tab_id: TAB_2.id,
        }),
      ],
    });

    const dashcardQueries = trackResponses(
      page,
      "POST",
      DASHCARD_QUERY_PATH,
    );
    await visitDashboard(page, api, dashboard.id);

    // Initial query for 1st tab
    await expect.poll(dashcardQueries).toBe(1);
    await assertNoLoadingSpinners(page);

    // Initial query for 2nd tab
    await goToTab(page, TAB_2.name);
    await expect.poll(dashcardQueries).toBe(2);
    await assertNoLoadingSpinners(page);

    // No parameters change, no query rerun
    await goToTab(page, TAB_1.name);
    await assertNoLoadingSpinners(page);
    expect(dashcardQueries()).toBe(2);

    // Rerun 1st tab query with new parameters
    await setDateFilter(page);
    await expect.poll(dashcardQueries).toBe(3);
    await assertNoLoadingSpinners(page);

    // Rerun 2nd tab query with new parameters
    await goToTab(page, TAB_2.name);
    await expect.poll(dashcardQueries).toBe(4);
    await assertNoLoadingSpinners(page);

    // No parameters change, no query rerun
    await goToTab(page, TAB_1.name);
    await goToTab(page, TAB_2.name);
    await assertNoLoadingSpinners(page);
    expect(dashcardQueries()).toBe(4);
  }

  test("should not rerun queries when switching tabs and there are no parameter changes", async ({
    page,
    mb,
  }) => {
    await runTabSwitchScenario(page, mb.api, {
      parameters: [DATE_FILTER],
      dashcardTemplate: COMMON_DASHCARD_INFO,
    });
  });

  test("should not rerun queries just because there are 9 or more attached filters to a dash-card", async ({
    page,
    mb,
  }) => {
    await runTabSwitchScenario(page, mb.api, {
      parameters: [
        DATE_FILTER,
        ID_FILTER,
        USER_ID_FILTER,
        PRODUCT_ID_FILTER,
        SUBTOTAL_FILTER,
        TOTAL_FILTER,
        TAX_FILTER,
        DISCOUNT_FILTER,
        QUANTITY_FILTER,
      ],
      dashcardTemplate: DASHCARD_WITH_9_FILTERS,
    });
  });
});

test.describe("issue 40695", () => {
  const TAB_1 = { id: 1, name: "Tab 1" };
  const TAB_2 = { id: 2, name: "Tab 2" };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show dashcards from other tabs after entering and leaving editing mode", async ({
    page,
    mb,
  }) => {
    const dashboard = await createDashboardWithTabs(mb.api, {
      tabs: [TAB_1, TAB_2],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          dashboard_tab_id: TAB_1.id,
          size_x: 10,
          size_y: 4,
          card_id: ORDERS_QUESTION_ID,
        }),
        createMockDashboardCard({
          id: -2,
          dashboard_tab_id: TAB_2.id,
          size_x: 10,
          size_y: 4,
          card_id: ORDERS_COUNT_QUESTION_ID,
        }),
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    await editDashboard(page);
    await editBar(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    const grid = dashboardGrid(page);
    await expect(grid.getByText("Orders", { exact: true })).toBeVisible();
    await expect(grid.getByText("Orders, Count", { exact: true })).toHaveCount(
      0,
    );
    await expect(grid.getByTestId("dashcard-container")).toHaveCount(1);
  });
});

const peopleSourceFieldRef = [
  "field",
  PEOPLE.SOURCE,
  { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
];
const ordersCreatedAtFieldRef = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

/** The shared setup of issues 42165 and 54353. */
async function setupFooBarQuestionDashboard(api: MetabaseApi): Promise<number> {
  const { dashboard } = await createDashboardWithQuestions(api, {
    dashboardDetails: {
      parameters: [
        mockParameter({
          id: "param-1",
          name: "Date",
          slug: "date",
          type: "date/all-options",
        }),
      ],
    },
    questions: [
      {
        name: "fooBarQuestion",
        display: "bar",
        query: {
          aggregation: [["count"]],
          breakout: [peopleSourceFieldRef, ordersCreatedAtFieldRef],
          "source-table": ORDERS_ID,
        },
      },
    ],
  });
  await addParameterMappingToFirstDashcard(api, dashboard.id, [
    "dimension",
    ordersCreatedAtFieldRef,
  ]);
  return dashboard.id;
}

test.describe("issue 42165", () => {
  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    dashboardId = await setupFooBarQuestionDashboard(mb.api);
  });

  test("should use card name instead of series names when navigating to QB from dashcard title", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, dashboardId);

    await filterWidget(page).click();
    const dashcardQuery = waitForDashcardQuery(page);
    await popover(page).getByText("Previous 30 days", { exact: true }).click();
    await dashcardQuery;

    const dataset = waitForResponseMatching(page, "POST", /^\/api\/dataset$/);
    await getDashboardCard(page, 0)
      .getByText("fooBarQuestion", { exact: true })
      .click();
    await dataset;

    await expect(page).toHaveTitle("fooBarQuestion · Metabase");
  });
});

test.describe("issue 47170", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.post(`/api/bookmark/dashboard/${ORDERS_DASHBOARD_ID}`);

    const { id: dashboardId } = await createDashboard(mb.api, {
      name: "Dashboard A",
    });
    await mb.api.post(`/api/bookmark/dashboard/${dashboardId}`);

    // The upstream middleware delays every GET /api/dashboard/:id response
    // by 1s.
    await delayResponses(page, /^\/api\/dashboard\/\d+$/, 1000, "GET");
  });

  test("should not show error when dashboard fetch request is cancelled (metabase#47170)", async ({
    page,
  }) => {
    await page.goto(`/dashboard/${ORDERS_DASHBOARD_ID}`);

    await appBar(page)
      .getByRole("button", { name: "Toggle sidebar", exact: true })
      .click();
    await navigationSidebar(page)
      .getByText("Dashboard A", { exact: true })
      .click();

    const main = page.getByRole("main");
    await expect(
      main.getByText("Something’s gone wrong", { exact: true }),
    ).toHaveCount(0);
    await expect(
      main.getByText("Dashboard A", { exact: true }),
    ).toBeVisible();
  });

  test("should show legible dark mode colors in fullscreen mode (metabase#51524)", async ({
    page,
  }) => {
    await page.goto("/account/profile");
    const colorSchemeInput = await inputWithValue(
      page.getByRole("main"),
      "Use system default",
    );
    await colorSchemeInput.click();
    const userUpdate = waitForResponseMatching(
      page,
      "PUT",
      /^\/api\/user\/\d+$/,
    );
    await popover(page).getByText("Dark", { exact: true }).click();
    await userUpdate;

    await page.goto(`/dashboard/${ORDERS_DASHBOARD_ID}`);

    await dashboardHeader(page)
      .getByLabel("Move, trash, and more…")
      .click();
    await popover(page).getByText("Enter fullscreen", { exact: true }).click();

    const primaryTextColor = "rgba(255, 255, 255, 0.95)";

    await expect(page.getByTestId("dashboard-name-heading")).toHaveCSS(
      "color",
      primaryTextColor,
    );

    await expect(
      getDashboardCard(page, 0).getByText("37.65", { exact: true }),
    ).toHaveCSS("color", primaryTextColor);

    await expect(page.getByTestId("sharing-menu-button")).toHaveCSS(
      "color",
      primaryTextColor,
    );
  });
});

test.describe("issue 49556", () => {
  const TAB = { id: 1, name: "Tab" };

  const PEOPLE_NAME_FIELD_REF = [
    "field",
    PEOPLE.NAME,
    { "base-type": "type/Text" },
  ];

  const TARGET_PARAMETER = {
    id: "d7988e02",
    name: "Target",
    slug: "target",
    type: "category",
    filteringParameters: ["d7988e03"],
  };

  const SOURCE_PARAMETER = {
    id: "d7988e03",
    name: "Source",
    slug: "source",
    type: "category",
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashboard = await createDashboardWithTabs(mb.api, {
      tabs: [TAB],
      parameters: [TARGET_PARAMETER, SOURCE_PARAMETER],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          dashboard_tab_id: TAB.id,
          size_x: 10,
          size_y: 4,
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            {
              parameter_id: TARGET_PARAMETER.id,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                PEOPLE_NAME_FIELD_REF,
                { "stage-number": 0 },
              ],
            },
            {
              parameter_id: SOURCE_PARAMETER.id,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                PEOPLE_NAME_FIELD_REF,
                { "stage-number": 0 },
              ],
            },
          ],
        }),
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);
  });

  test("unlinks the filter when it is removed (metabase#49556)", async ({
    page,
  }) => {
    await editDashboard(page);

    await page
      .getByTestId("fixed-width-filters")
      .getByText("Source", { exact: true })
      .click();
    await dashboardParameterSidebar(page)
      .getByText("Remove", { exact: true })
      .click();

    await page
      .getByTestId("fixed-width-filters")
      .getByText("Target", { exact: true })
      .click();
    await expect(
      dashboardParameterSidebar(page).getByRole("button", {
        name: "Edit",
        exact: true,
      }),
    ).toBeEnabled();
  });
});

test.describe("issue 54353", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should close date filter on esc (metabase#54353)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await setupFooBarQuestionDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    // set dashboard filter value
    await page.getByLabel("Date", { exact: true }).click();
    await popover(page).getByText(/Previous 12 months/i).click();

    await page.getByLabel("Date", { exact: true }).click();

    await page.keyboard.press("Escape");

    // make sure popover is not open
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("issue 44937", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signIn("readonly");
  });

  test("dashboard empty state should not suggest creating a new question when users have no creation permission (metabase#44937)", async ({
    page,
  }) => {
    await page.goto("/");
    await newButton(page).click();
    await popover(page).getByText("Dashboard", { exact: true }).click();
    const dialog = modal(page);
    await dialog
      .getByPlaceholder("What is the name of your dashboard?", { exact: true })
      .fill("my dashboard");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    await expect(
      page
        .getByRole("main")
        .getByText(
          "Browse your collections to find and add existing questions.",
          { exact: true },
        ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add a chart", exact: true }).click();
    await sidebar(page).getByText("Our analytics", { exact: true }).click();
    await sidebar(page).getByText("Orders", { exact: true }).click();

    await createNewTab(page);

    await expect(
      page
        .getByRole("main")
        .getByText(
          "Browse your collections to find and add existing questions.",
          { exact: true },
        ),
    ).toBeVisible();
  });
});

test.describe("issue 56716", () => {
  async function setupDashboard(page: Page, api: MetabaseApi) {
    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [
          ["field", PRODUCTS.ID, null],
          ["field", PRODUCTS.RATING, null],
        ],
      },
    };

    const parameterDetails = {
      id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
      type: "number/=",
      target: ["dimension", ["field", PRODUCTS.RATING, null]],
      name: "Number",
      slug: "number",
    };

    const dashboardDetails = {
      parameters: [parameterDetails],
    };

    const vizSettings = {
      column_settings: {
        '["name","RATING"]': {
          click_behavior: {
            type: "crossfilter",
            parameterMapping: {
              [parameterDetails.id]: {
                id: parameterDetails.id,
                source: { id: "RATING", name: "RATING", type: "column" },
                target: {
                  id: parameterDetails.id,
                  type: "parameter",
                },
              },
            },
          },
        },
      },
    };

    const dashcard = await createQuestionAndDashboard(api, {
      questionDetails,
      dashboardDetails,
    });

    await editDashboardCard(api, dashcard, {
      parameter_mappings: [
        {
          card_id: dashcard.card_id,
          parameter_id: parameterDetails.id,
          target: ["dimension", ["field", PRODUCTS.RATING, null]],
        },
      ],
      visualization_settings: vizSettings,
    });

    await visitDashboard(page, api, dashcard.dashboard_id);
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should reset the filter when clicking on a column value twice with a click behavior enabled (metabase#56716)", async ({
    page,
    mb,
  }) => {
    await setupDashboard(page, mb.api);

    // Multiple rendered rows can carry 4.6 — Cypress-first-match semantics.
    await getDashboardCard(page)
      .getByText("4.6", { exact: true })
      .first()
      .click();
    await expect(filterWidget(page)).toContainText("4.6");
    await expect(
      getDashboardCard(page).getByText("4 rows", { exact: true }),
    ).toBeVisible();

    await getDashboardCard(page)
      .getByText("4.6", { exact: true })
      .first()
      .click();
    await expect(filterWidget(page)).not.toContainText("4.6");
    await expect(
      getDashboardCard(page).getByText("200 rows", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("Issue 46337", () => {
  const MODEL_NAME = "Model 46337";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const model = await createQuestion(mb.api, {
      type: "model",
      name: MODEL_NAME,
      query: {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          ["field", ORDERS.TAX, { "base-type": "type/Float" }],
          ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
          ["field", ORDERS.DISCOUNT, { "base-type": "type/Float" }],
          ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
        ],
        joins: [
          {
            fields: "all",
            alias: "Products",
            "source-table": PEOPLE_ID,
            strategy: "left-join",
            condition: [
              "=",
              ["field", ORDERS.USER_ID, {}],
              ["field", PEOPLE.ID, { "join-alias": "Products" }],
            ],
          },
        ],
      },
    });
    await page.goto(`/auto/dashboard/model/${model.id}`);
  });

  // TODO: unskip when metabase#46337 is fixed
  // See: https://github.com/metabase/metabase/issues/46337
  test.skip("should (metabase#46337)", async ({ page }) => {
    // ensure the dashcards render data not errors
    const grid = page.getByTestId("dashboard-grid");
    await expect(
      grid.getByText("There was a problem displaying this chart.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      grid.getByText(`Total ${MODEL_NAME}`, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 62170", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should only refresh card data, not reload entire dashboard when auto-refresh is enabled", async ({
    page,
    mb,
  }) => {
    const REFRESH_PERIOD = 3;

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "Orders Count",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      },
    });
    const dashboardId = dashcard.dashboard_id;

    const dashboardLoads = trackResponses(
      page,
      "GET",
      new RegExp(`^/api/dashboard/${dashboardId}$`),
    );
    const initialCardQuery = waitForDashcardQuery(page);
    await page.goto(`/dashboard/${dashboardId}#refresh=${REFRESH_PERIOD}`);

    // Wait for initial dashboard load
    await expect.poll(dashboardLoads).toBeGreaterThanOrEqual(1);
    await initialCardQuery;

    // Verify dashboard is loaded
    await expect(
      getDashboardCard(page).getByText("Orders Count", { exact: true }),
    ).toBeVisible();

    // Verify card data was refreshed (the auto-refresh fires after 3s)
    await waitForDashcardQuery(page);

    // Verify dashboard itself was NOT reloaded
    expect(dashboardLoads()).toBe(1);
  });
});

test.describe("issue 52674", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be possible to open a parameter widget using the keyboard shortcut (metabase#52674)", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [
        {
          query: {
            "source-table": ORDERS_ID,
          },
        },
      ],
      dashboardDetails: {
        parameters: [
          mockParameter({
            id: "param-1",
            name: "Number",
            slug: "number",
            type: "number/between",
          }),
        ],
      },
    });
    await addParameterMappingToFirstDashcard(mb.api, dashboard.id, [
      "dimension",
      ["field", ORDERS.TOTAL, { "base-type": "type/Number" }],
    ]);
    await visitDashboard(page, mb.api, dashboard.id);

    const numberButton = page
      .getByRole("main")
      .getByRole("button", { name: "Number", exact: true });

    // Opening with Enter should work
    await numberButton.focus();
    await page.keyboard.press("Enter");
    await expect(popover(page)).toBeVisible();

    // Close the popover
    await numberButton.click();
    await expect(popover(page)).toHaveCount(0);

    // Opening with Space should work
    await numberButton.focus();
    await page.keyboard.press("Space");
    await expect(popover(page)).toBeVisible();
  });
});

test.describe("issue 53370", () => {
  const LONG_NAME = "a".repeat(254);

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const { id } = await createDashboard(mb.api, { name: LONG_NAME });
    await visitDashboard(page, mb.api, id);
  });

  test("should wrap long dashboard named (metabase#53370)", async ({
    page,
  }) => {
    const heading = page.getByTestId("dashboard-name-heading");
    await expect(heading).toHaveValue(LONG_NAME);
    await expect(heading).toBeVisible();
    const fitsViewport = await heading.evaluate(
      (el) => (el as HTMLElement).offsetWidth < window.innerWidth,
    );
    expect(fitsViewport).toBe(true);
  });
});

test.describe("issue 63176", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not be possible to save a dashboard with an empty name and the correct error should be displayed (metabase#63176)", async ({
    page,
  }) => {
    await page.goto("/");
    await newButton(page).click();
    await popover(page).getByText("Dashboard", { exact: true }).click();

    const dialog = modal(page);
    const nameInput = dialog.getByPlaceholder(
      "What is the name of your dashboard?",
      { exact: true },
    );
    await nameInput.fill(" ");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    await expect(
      dialog.getByText("value must be a non-blank string.", { exact: true }),
    ).toBeVisible();
    await expect(nameInput).toHaveAttribute("aria-invalid", "true");
    await expect(
      dialog.getByRole("button", { name: "Failed", exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 64138", () => {
  const MAP_QUESTION = {
    query: {
      "source-table": PEOPLE_ID,
    },
    display: "map",
    // displayIsLocked from the upstream details is a frontend-only card
    // field the create API ignores; dropped here.
    visualization_settings: {
      "map.type": "pin",
      "map.pin_type": "markers",
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: MAP_QUESTION,
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);
  });

  test("should hide map controls when editing dashboard (metabase#64138)", async ({
    page,
  }) => {
    await editDashboard(page);

    // hovering the map should not show the zoom controls
    const card = getDashboardCard(page, 0);
    await card.hover();
    await expect(card.getByLabel("Zoom in")).toHaveCount(0);
    const setDefaultView = card.getByText("Set as default view", {
      exact: true,
    });
    await expect(setDefaultView).toBeVisible();
    await setDefaultView.click();

    // hovering marker icons should not open their tooltips
    const markers = card.locator(".leaflet-marker-icon");
    await expect(markers.first()).toBeVisible();
    await markers.last().hover();
    await expect(popover(page)).toHaveCount(0);

    // clicking marker icons should not navigate to the question
    await markers.last().click({ force: true });
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toMatch(/^\/dashboard\/\d+$/);
    await expect(modal(page)).toHaveCount(0);
  });
});

test.describe("issue 58556, issue 66277", () => {
  const QUESTION = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour" }]],
    },
    display: "table",
  };

  const PARAMETER = mockParameter({
    id: "date-param",
    name: "Date",
    slug: "date",
    type: "date/all-options",
  });

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [QUESTION],
      dashboardDetails: {
        parameters: [PARAMETER],
      },
    });
    await addParameterMappingToFirstDashcard(mb.api, dashboard.id, [
      "dimension",
      [
        "field",
        "CREATED_AT",
        {
          "base-type": "type/DateTime",
          "inherited-temporal-unit": "hour",
        },
      ],
      { "stage-number": 1 },
    ]);

    await visitDashboard(page, mb.api, dashboard.id);

    await editDashboard(page);
    await showDashboardCardActions(page);
  });

  test("should be possible to add a click action on a time column with hour granularity and have the time be present in the resulting parameter (metabase#58556)", async ({
    page,
  }) => {
    const cbSidebar = await clickBehaviorSidebar(page);
    await cbSidebar.getByText("Created At: Hour", { exact: true }).click();
    await cbSidebar
      .getByText("Update a dashboard filter", { exact: true })
      .click();
    await cbSidebar.getByText("Date", { exact: true }).click();

    await popover(page).getByText("Created At: Hour", { exact: true }).click();
    await sidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await saveDashboard(page);

    // click a row
    await dashboardCards(page)
      .getByTestId("table-body")
      .getByTestId("link-formatted-text")
      .first()
      .click();

    // ensure the filter contains a time value
    await expect
      .poll(() => new URL(page.url()).searchParams.get("date") ?? "")
      .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  test("should pass hour or minutes to linked questions from click actions (metabase#66277)", async ({
    page,
  }) => {
    const cbSidebar = await clickBehaviorSidebar(page);
    await cbSidebar.getByText("Created At: Hour", { exact: true }).click();
    await cbSidebar
      .getByText("Go to a custom destination", { exact: true })
      .click();
    await cbSidebar.getByText("Saved question", { exact: true }).click();

    await entityPickerModal(page).getByText("Orders", { exact: true }).click();

    const createdAtColumn = sidebar(page).getByText("Created At", {
      exact: true,
    });
    await createdAtColumn.scrollIntoViewIfNeeded();
    await createdAtColumn.click();

    await popover(page).getByText("Created At: Hour", { exact: true }).click();
    await sidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await saveDashboard(page);

    // click a row
    await dashboardCards(page)
      .getByTestId("table-body")
      .getByTestId("link-formatted-text")
      .first()
      .click();

    await expect(
      queryBuilderFiltersPanel(page).getByText(
        /Created At is .* \d{1,2}:\d{2} (AM|PM) – \d{1,2}:\d{2} (AM|PM)/,
      ),
    ).toBeVisible();
  });
});
