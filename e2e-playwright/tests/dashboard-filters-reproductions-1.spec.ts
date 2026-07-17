/**
 * Playwright port of
 * e2e/test/scenarios/filters-reproductions/dashboard-filters-reproductions-1.cy.spec.js
 *
 * Porting notes:
 * - Intercept-count assertions (cy.get("@alias.all").should("have.length", n))
 *   become trackResponses counters; a short settle wait guards the "no extra
 *   request fired" negative checks.
 * - issue 24235's dashboard-query intercept was never awaited — dropped.
 * - issue 25374's beforeEach dashcard intercept upstream has a typo'd double
 *   slash ("card//.../query"); the port matches the real dashcard query path.
 * - issue 22482 computes the expected range with plain Date math instead of
 *   dayjs (not a dependency of this project).
 * - issue 12985-2 is tagged @skip upstream — kept skipped here.
 * - issue 26230's "title input not visible after scroll" check is an
 *   in-viewport check here: Playwright's toBeVisible() ignores scroll
 *   clipping, Cypress's "not.be.visible" does not.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";

import {
  commandPalette,
  createDashboardWithTabs,
  goToAdmin,
} from "../support/command-palette";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
  waitForDashcardsToLoad,
} from "../support/dashboard";
import { icon, inputWithValue } from "../support/dashboard-cards";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { SAMPLE_DB_SCHEMA_ID } from "../support/data-model";
import { containsText } from "../support/filters";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  caseSensitiveSubstring,
  commandPaletteSearch,
  createDashboard,
  createDashboardWithQuestions,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
  dashboardParameterSidebar,
  dashboardParametersContainer,
  dashboardParametersPopover,
  editDashboardCard,
  editingFilterWidget,
  editingParametersContainer,
  findByDisplayValue,
  formatMonthDayYear,
  goToMainApp,
  isClippedByScrollContainer,
  goToTab,
  setAdHocFilter,
  setModelMetadata,
  trackResponses,
  updateDashboardCards,
  visitDashboardWithParams,
  visitEmbeddedDashboard,
  waitForResponseMatching,
} from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { tableInteractive } from "../support/models";
import { fieldValuesCombobox } from "../support/native-filters";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { tableInteractiveBody } from "../support/question-new";
import { visitPublicDashboard } from "../support/question-saved";
import { openQuestionsSidebar } from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import {
  appBar,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

const urlSearch = (page: Page) => () => new URL(page.url()).search;

/** The slice of the mb fixture these spec-local helpers need. */
type Harness = { api: MetabaseApi };

test.describe("issue 8030 + 32444", () => {
  const filterDetails = {
    name: "ID Column",
    slug: "id",
    id: "11d79abe",
    type: "id",
    sectionId: "id",
  };

  const question1Details = {
    name: "Q1",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const question2Details = {
    name: "Q2",
    query: { "source-table": ORDERS_ID, limit: 2 },
  };

  // Upstream passes `type: "query"` here; the card type is "question".
  const questionWithFilter = {
    name: "Question with Filter",
    query: {
      "source-table": ORDERS_ID,
      limit: 2,
      filter: [">", ["field", ORDERS.TOTAL, null], 100],
    },
  };

  const dashboardDetails = {
    name: "Filters",
    parameters: [filterDetails],
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not reload dashboard cards not connected to a filter (metabase#8030)", async ({
    page,
    mb,
  }) => {
    const { id: card1Id } = await createQuestion(mb.api, question1Details);
    const { id: card2Id } = await createQuestion(mb.api, question2Details);
    const { id: dashboardId } = await createDashboard(mb.api, dashboardDetails);
    await updateDashboardCards(mb.api, {
      dashboard_id: dashboardId,
      cards: [
        {
          card_id: card1Id,
          row: 0,
          col: 0,
          size_x: 5,
          size_y: 4,
          parameter_mappings: [
            {
              parameter_id: filterDetails.id,
              card_id: card1Id,
              target: ["dimension", ["field", PRODUCTS.ID, null]],
            },
          ],
        },
        {
          card_id: card2Id,
          row: 0,
          col: 4,
          size_x: 5,
          size_y: 4,
          parameter_mappings: [
            {
              parameter_id: filterDetails.id,
              card_id: card1Id,
              target: ["dimension", ["field", ORDERS.ID, null]],
            },
          ],
        },
      ],
    });

    const card1QueryRe = new RegExp(
      `^/api/dashboard/${dashboardId}/dashcard/\\d+/card/${card1Id}/query$`,
    );
    const card2QueryRe = new RegExp(
      `^/api/dashboard/${dashboardId}/dashcard/\\d+/card/${card2Id}/query$`,
    );
    const card1Queries = trackResponses(page, "POST", card1QueryRe);
    const card2Queries = trackResponses(page, "POST", card2QueryRe);

    const dashboardLoad = waitForResponseMatching(
      page,
      "GET",
      new RegExp(`^/api/dashboard/${dashboardId}$`),
    );
    const firstCard1Query = waitForResponseMatching(page, "POST", card1QueryRe);
    const firstCard2Query = waitForResponseMatching(page, "POST", card2QueryRe);
    await page.goto(`/dashboard/${dashboardId}`);
    await Promise.all([dashboardLoad, firstCard1Query, firstCard2Query]);

    await page.getByText(filterDetails.name, { exact: true }).click();
    const parametersPopover = dashboardParametersPopover(page);
    // The filter is connected only to the first card.
    await parametersPopover
      .getByPlaceholder("Enter an ID", { exact: true })
      .pressSequentially("1");
    const filteredCard1Query = waitForResponseMatching(
      page,
      "POST",
      card1QueryRe,
    );
    await parametersPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await filteredCard1Query;

    // Settle beat so a second (unexpected) query would be counted.
    await page.waitForTimeout(500);
    expect(card1Queries()).toBe(2);
    expect(card2Queries()).toBe(1);
  });

  test("should not reload dashboard cards not connected to a filter (metabase#32444)", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [question1Details, questionWithFilter],
    });
    const cardQueryRe = new RegExp(
      `^/api/dashboard/${dashboard.id}/dashcard/\\d+/card/\\d+/query$`,
    );
    const cardQueries = trackResponses(page, "POST", cardQueryRe);

    await visitDashboard(page, mb.api, dashboard.id);
    await editDashboard(page);
    expect(cardQueries()).toBe(2);

    await setFilter(page, "Text or Category", "Is");
    await selectDashboardFilter(page.getByTestId("dashcard").first(), "Title");

    await undoToast(page)
      .getByRole("button", { name: "Auto-connect" })
      .click();

    await page
      .getByTestId("dashcard")
      .nth(1)
      .getByLabel("Disconnect")
      .click();

    await saveDashboard(page);

    // Saving exits edit mode and reloads the dashcards in view mode. Wait for
    // both cards to settle, then count only filter-triggered queries from a
    // post-save baseline (mirrors the upstream re-alias trick).
    await expect(page.getByTestId("dashcard")).toHaveCount(2);
    await waitForDashcardsToLoad(page);
    await page.waitForTimeout(500);
    const baseline = cardQueries();

    const filteredQuery = waitForResponseMatching(page, "POST", cardQueryRe);
    await filterWidget(page).click();
    await dashboardParametersPopover(page)
      .getByText("Aerodynamic Bronze Hat", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await filteredQuery;

    // Only the card connected to the filter should re-execute.
    await page.waitForTimeout(500);
    expect(cardQueries() - baseline).toBe(1);
  });
});

test.describe("issue 12720, issue 47172", () => {
  // After January 1st, 2029
  const dashboardFilter = {
    default: "2029-01-01~",
    id: "d3b78b27",
    name: "Date Filter",
    slug: "date_filter",
    type: "date/all-options",
  };

  const questionDetails = {
    name: "12720_SQL",
    native: {
      query: "SELECT * FROM ORDERS WHERE {{filter}}",
      "template-tags": {
        filter: {
          id: "1d006bb7-045f-6c57-e41b-2661a7648276",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", ORDERS.CREATED_AT, null],
          "widget-type": "date/all-options",
          default: null,
        },
      },
    },
  };

  async function clickThrough(page: Page, mb: Harness, title: string) {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await page
      .getByTestId("dashcard-container")
      .getByText(caseSensitiveSubstring(title))
      .first()
      .click();

    await expect
      .poll(urlSearch(page))
      .toContain(dashboardFilter.default);
    await expect(
      filterWidget(page).getByText(/After January 1, 2029/),
    ).toBeVisible();
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // In this test we're using the already present question ("Orders") and
    // the dashboard with that question ("Orders in a dashboard").
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [dashboardFilter],
    });

    const { id: sqlId } = await createNativeQuestion(mb.api, questionDetails);
    await updateDashboardCards(mb.api, {
      dashboard_id: ORDERS_DASHBOARD_ID,
      cards: [
        {
          card_id: sqlId,
          row: 0,
          col: 8, // making sure it doesn't overlap the existing card
          size_x: 7,
          size_y: 5,
          parameter_mappings: [
            {
              parameter_id: dashboardFilter.id,
              card_id: sqlId,
              target: ["dimension", ["template-tag", "filter"]],
            },
          ],
        },
        // add filter to existing card
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 7,
          size_y: 5,
          parameter_mappings: [
            {
              parameter_id: dashboardFilter.id,
              card_id: ORDERS_QUESTION_ID,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ],
        },
      ],
    });
  });

  // Both tests in this describe are fixme'd: a dashcard title drill-through
  // does not carry the dashboard filter's value into the question URL, so the
  // search string stays empty. Verified 2026-07-17 against this slot backend:
  // the ORIGINAL Cypress spec fails identically here ("expected '' to include
  // '2029-01-01~'"), so this is not a porting defect. Cause not established —
  // the e2e snapshot is newer than the latest migration, so snapshot staleness
  // is ruled out; whether CI (jar backend + static assets) also fails is
  // unverified from this spec. Remove fixme once the drill-through carries the
  // parameter again.
  test("should show QB question on a dashboard with filter connected to card without data-permission (metabase#12720)", async ({
    page,
    mb,
  }) => {
    await mb.signIn("readonly");

    await clickThrough(page, mb, "12720_SQL");
    await clickThrough(page, mb, "Orders");
  });

  test("should apply the specific (before|after) filter on a native question with field filter (metabase#47172)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    const card = getDashboardCard(page, 1);
    await expect(
      card.getByText("There was a problem displaying this chart."),
    ).toHaveCount(0);

    // Drill down to the question.
    const cardQuery = waitForResponseMatching(
      page,
      "POST",
      /^\/api\/card\/\d+\/query$/,
    );
    await card.getByText(questionDetails.name, { exact: true }).click();

    await expect
      .poll(urlSearch(page))
      .toBe(`?filter=${dashboardFilter.default}`);
    await cardQuery;
    await expect(tableInteractive(page)).toBeVisible();
    await expect(containsText(tableInteractive(page), "97.44").first()).toBeVisible();
    await expect(page.getByTestId("question-row-count")).toHaveText(
      "Showing 1,980 rows",
    );
  });
});

test.describe("issue 12985 > dashboard filter dropdown/search", () => {
  const categoryFilter = {
    name: "Category",
    slug: "category",
    id: "2a12e66c",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = { parameters: [categoryFilter] };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should work for saved nested questions (metabase#12985-1)", async ({
    page,
    mb,
  }) => {
    const { id: q1Id } = await createQuestion(mb.api, {
      name: "Q1",
      query: { "source-table": PRODUCTS_ID },
    });
    // Create nested card based on the first one
    const nestedQuestion = {
      name: "Q2",
      query: { "source-table": `card__${q1Id}` },
    };
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: nestedQuestion,
      dashboardDetails,
    });

    // Connect dashboard filter to the nested card
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 13,
          size_y: 8,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: categoryFilter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
          ],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await filterWidget(page)
      .getByText(caseSensitiveSubstring("Category"))
      .click();
    // Failing to show dropdown in v0.36.0 through v.0.37.0
    const dropdown = dashboardParametersPopover(page);
    await expect(dropdown.getByText("Doohickey", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("Gizmo", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("Widget", { exact: true })).toBeVisible();
    await dropdown.getByText("Gadget", { exact: true }).click();
    await page.getByRole("button", { name: "Add filter", exact: true }).click();

    await expect.poll(urlSearch(page)).toBe("?category=Gadget");
    // The virtualized table renders the cell once per quadrant — .first().
    await expect(
      page.getByText("Ergonomic Silk Coat", { exact: true }).first(),
    ).toBeVisible();
  });

  test("should work for aggregated questions (metabase#12985-2)", async ({
    page,
    mb,
  }) => {
    // Upstream Cypress test carries { tags: "@skip" } — kept skipped.
    test.skip(true, "Upstream @skip tag (metabase#12985 not fixed)");

    const questionDetails = {
      name: "12985-v2",
      query: {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1],
      },
    };

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });

    // Connect dashboard filter to the aggregated card
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 6,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: categoryFilter.id,
              card_id: dashcard.card_id,
              target: [
                "dimension",
                ["field", "CATEGORY", { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await filterWidget(page)
      .getByText(caseSensitiveSubstring("Category"))
      .click();
    // It will fail at this point until the issue is fixed because the popover
    // never appears.
    await containsText(popover(page), "Gadget").first().click();
    await page.getByText("Add filter", { exact: true }).click();
    await expect.poll(() => page.url()).toContain("?category=Gadget");
    await expect(
      page.getByText("Ergonomic Silk Coat", { exact: true }).first(),
    ).toBeVisible();
  });
});

test.describe("issues 15119 and 16112", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.put(`/api/field/${REVIEWS.REVIEWER}`, {
      has_field_values: "list",
      semantic_type: "type/Category",
    });
    await mb.api.put(`/api/field/${REVIEWS.RATING}`, {
      has_field_values: "list",
      semantic_type: "type/Category",
    });
  });

  test("user without data permissions should be able to use dashboard filters (metabase#15119, metabase#16112)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "15119",
      query: { "source-table": REVIEWS_ID },
    };

    const ratingFilter = {
      name: "Rating Filter",
      slug: "rating",
      id: "5dfco74e",
      type: "string/=",
      sectionId: "string",
    };

    const reviewerFilter = {
      name: "Reviewer Filter",
      slug: "reviewer",
      id: "ad1c877e",
      type: "string/=",
      sectionId: "string",
    };

    const dashboardDetails = { parameters: [reviewerFilter, ratingFilter] };

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });

    // Connect filters to the card
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 9,
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: ratingFilter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", REVIEWS.RATING, null]],
            },
            {
              parameter_id: reviewerFilter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", REVIEWS.REVIEWER, null]],
            },
          ],
        },
      ],
    });

    // Actually need to setup the linked filter:
    await visitDashboard(page, mb.api, dashcard.dashboard_id);
    await editDashboard(page);
    await page.getByText("Rating Filter", { exact: true }).click();
    await page.getByText("Linked filters", { exact: true }).click();

    // Turn on the toggle (Mantine Switch: the input is visually hidden).
    await sidebar(page).getByRole("switch").click({ force: true });

    await saveDashboard(page);

    await mb.signIn("nodata");
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await page.getByText(reviewerFilter.name, { exact: true }).click();
    await containsText(dashboardParametersPopover(page), "adam")
      .first()
      .click();
    await page.getByRole("button", { name: "Add filter", exact: true }).click();

    const dashcardContainer = page.getByTestId("dashcard-container");
    await expect(containsText(dashcardContainer, "adam").first()).toBeVisible();
    await expect.poll(urlSearch(page)).toBe("?rating=&reviewer=adam");

    await page.getByText(ratingFilter.name, { exact: true }).click();
    await containsText(dashboardParametersPopover(page), "5").first().click();
    await page.getByRole("button", { name: "Add filter", exact: true }).click();

    await expect(containsText(dashcardContainer, "adam").first()).toBeVisible();
    await expect(containsText(dashcardContainer, "5").first()).toBeVisible();
    await expect.poll(urlSearch(page)).toBe("?rating=5&reviewer=adam");
  });
});

test.describe("issue 16663", () => {
  const questionDetails = {
    query: { "source-table": ORDERS_ID },
  };

  const FILTER = {
    name: "Quarter and Year",
    slug: "quarter_and_year",
    id: "f8ae0c97",
    type: "date/quarter-year",
    sectionId: "date",
    default: "Q1-2026",
  };

  const dashboardDetails = { parameters: [FILTER] };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should remove filter value from url after going to another dashboard (metabase#16663)", async ({
    page,
    mb,
  }) => {
    const dashboardToRedirect = "Orders in a dashboard";
    const queryParam = "quarter_and_year=Q1";

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      card_id: dashcard.card_id,
      card: {
        parameter_mappings: [
          {
            parameter_id: FILTER.id,
            card_id: dashcard.card_id,
            target: [
              "dimension",
              ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
            ],
          },
        ],
      },
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await expect.poll(() => page.url()).toContain(queryParam);

    await commandPaletteSearch(page, dashboardToRedirect);
    await commandPalette(page)
      .getByRole("option", { name: dashboardToRedirect, exact: true })
      .click();

    await expect.poll(() => page.url()).toContain("orders-in-a-dashboard");
    expect(page.url()).not.toContain(queryParam);
  });
});

test.describe("issue 17211", () => {
  const questionDetails = {
    query: { "source-table": ORDERS_ID },
  };

  const filter = {
    name: "Location",
    slug: "location",
    id: "96917420",
    type: "string/=",
    sectionId: "location",
  };

  const dashboardDetails = { parameters: [filter] };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 6,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id: dashcard.card_id,
              target: [
                "dimension",
                ["field", PEOPLE.CITY, { "source-field": ORDERS.USER_ID }],
              ],
            },
          ],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);
  });

  test("should not falsely alert that no matching dashboard filter has been found (metabase#17211)", async ({
    page,
  }) => {
    await filterWidget(page).click();

    const dropdown = dashboardParametersPopover(page);
    await dropdown
      .getByPlaceholder("Search the list")
      .pressSequentially("abb");
    await dropdown.getByText("Abbeville", { exact: true }).click();

    await expect(containsText(dropdown, "No matching City found")).toHaveCount(
      0,
    );
  });
});

test.describe("issue 17551", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id: baseQuestionId } = await createNativeQuestion(mb.api, {
      native: {
        query:
          "select 'yesterday' as \"text\", dateadd('day', -1, current_date::date) as \"date\" union all\nselect 'today', current_date::date union all\nselect 'tomorrow', dateadd('day', 1, current_date::date)\n",
      },
    });

    const questionDetails = {
      name: "17551 QB",
      query: { "source-table": `card__${baseQuestionId}` },
    };

    const filter = {
      name: "Date Filter",
      slug: "date_filter",
      id: "888188ad",
      type: "date/all-options",
      sectionId: "date",
    };

    const dashboardDetails = { parameters: [filter] };

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });

    await editDashboardCard(mb.api, dashcard, {
      parameter_mappings: [
        {
          parameter_id: filter.id,
          card_id: dashcard.card_id,
          target: [
            "dimension",
            ["field", "date", { "base-type": "type/DateTime" }],
          ],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);
  });

  test("should include today in the 'All time' date filter when chosen 'Next' (metabase#17551)", async ({
    page,
  }) => {
    await filterWidget(page).click();
    await setAdHocFilter(page, { condition: "Next", includeCurrent: true });

    await expect.poll(() => page.url()).toContain("?date_filter=next30days~");

    // The virtualized table renders each cell once per quadrant — .first().
    await expect(
      page.getByText("tomorrow", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("today", { exact: true }).first()).toBeVisible();
  });
});

test.describe("issue 16177", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.put(`/api/field/${ORDERS.QUANTITY}`, {
      coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      semantic_type: null,
    });
  });

  test("should not lose the default value of the parameter connected to a field with a coercion strategy applied (metabase#16177)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await setFilter(page, "Date picker", "All Options");
    await selectDashboardFilter(getDashboardCard(page), "Quantity");
    await dashboardParameterSidebar(page)
      .getByText("No default", { exact: true })
      .click();
    await popover(page).getByText("Yesterday", { exact: true }).click();
    await saveDashboard(page);
    await expect(
      filterWidget(page).getByText("Yesterday", { exact: true }),
    ).toBeVisible();
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await expect(
      filterWidget(page).getByText("Yesterday", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 20656", () => {
  const filter = {
    name: "ID",
    slug: "id",
    id: "11d79abe",
    type: "id",
    sectionId: "id",
  };

  const questionDetails = {
    query: { "source-table": PRODUCTS_ID, limit: 2 },
    collection_id: ADMIN_PERSONAL_COLLECTION_ID,
  };

  const dashboardDetails = { parameters: [filter] };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow a user to visit a dashboard even without a permission to see the dashboard card (metabase#20656, metabase#24536)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 24,
          size_y: 10,
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", PRODUCTS.ID, null]],
            },
          ],
        },
      ],
    });

    await mb.signInAsNormalUser();
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    // Make sure the filter widget is there
    await expect(filterWidget(page)).toBeVisible();
    await expect(
      page.getByText("Sorry, you don't have permission to see this card.", {
        exact: true,
      }),
    ).toBeVisible();

    // Trying to edit the filter should not show mapping fields and shouldn't
    // break the frontend (metabase#24536)
    await editDashboard(page);
    await editingFilterWidget(page).click();

    const card = getDashboardCard(page);
    await expect(
      card.getByText("Column to filter on", { exact: true }),
    ).toBeVisible();
    await expect(icon(card, "key")).toBeVisible();
  });
});

test.describe("issue 21528", () => {
  const NATIVE_QUESTION_DETAILS = {
    name: "Orders with Product ID filter",
    native: {
      query: "select * from ORDERS where {{product_id}}",
      "template-tags": {
        product_id: {
          type: "dimension",
          name: "product_id",
          id: "56708d23-6f01-42b7-98ed-f930295d31b9",
          "display-name": "Product ID",
          dimension: ["field", ORDERS.PRODUCT_ID, null],
          "widget-type": "id",
        },
      },
    },
    parameters: [
      {
        id: "56708d23-6f01-42b7-98ed-f930295d31b9",
        type: "id",
        target: ["dimension", ["template-tag", "product_id"]],
        name: "Product ID",
        slug: "product_id",
      },
    ],
  };

  const DASHBOARD_DETAILS = {
    name: "Dashboard with ID filter",
    parameters: [
      {
        id: "9f85cd3d",
        name: "Product ID",
        sectionId: "id",
        slug: "product_id",
        type: "id",
      },
    ],
  };

  let questionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    ({ id: questionId } = await createNativeQuestion(
      mb.api,
      NATIVE_QUESTION_DETAILS,
    ));

    // set Orders.Product_ID "Filtering on this field": "A list of all values"
    await mb.api.put(`/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });

    // set Orders.Product_ID "Display values": "Use foreign key > Title"
    await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      type: "external",
      name: "Product ID",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    const { id: dashboardId } = await createDashboard(
      mb.api,
      DASHBOARD_DETAILS,
    );
    await addOrUpdateDashboardCard(mb.api, {
      card_id: questionId,
      dashboard_id: dashboardId,
      card: {
        parameter_mappings: [
          {
            card_id: questionId,
            parameter_id: "9f85cd3d",
            target: ["dimension", ["template-tag", "product_id"]],
          },
        ],
      },
    });
  });

  // The FK-remapped field values ("Rustic Paper Wallet - 1") never render in
  // the native question's parameter dropdown. Verified 2026-07-17: the
  // ORIGINAL Cypress spec fails identically against this same backend
  // ("Expected to find content: 'Rustic Paper Wallet - 1' within the element:
  // <div...Popover...> but never did"), so this is not a porting defect.
  // Cause not established (snapshot staleness ruled out — it is newer than the
  // latest migration); CI behavior unverified from this spec.
  test("should show dashboard ID filter values when mapped to a native question with a foreign key field filter", async ({
    page,
  }) => {
    await visitQuestion(page, questionId);

    await page
      .getByTestId("native-query-top-bar")
      .getByText("Product ID", { exact: true })
      .click();
    await expect(
      containsText(popover(page), "Rustic Paper Wallet - 1").first(),
    ).toBeVisible();

    // Navigating to another page via JavaScript is faster than a full reload.
    await openNavigationSidebar(page);
    await navigationSidebar(page)
      .getByText("Our analytics", { exact: true })
      .click();
    await page
      .getByRole("main")
      .getByText(DASHBOARD_DETAILS.name, { exact: true })
      .click();

    await dashboardParametersContainer(page)
      .getByText("Product ID", { exact: true })
      .click();
    await expect(
      containsText(popover(page), "Aerodynamic Bronze Hat - 144").first(),
    ).toBeVisible();

    // The following scenario breaks on 46
    await goToAdmin(page);
    await appBar(page).getByText("Table Metadata", { exact: true }).click();
    await expect(
      page
        .getByRole("main")
        .getByText("Start by selecting data to model", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => decodeURIComponent(new URL(page.url()).pathname))
      .toBe(`/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}`);
    await goToMainApp(page);

    await openNavigationSidebar(page);
    await navigationSidebar(page)
      .getByText("Our analytics", { exact: true })
      .click();
    await page
      .getByRole("main")
      .getByText(DASHBOARD_DETAILS.name, { exact: true })
      .click();

    // Assert that the dashboard ID filter values are still showing correctly.
    await dashboardParametersContainer(page)
      .getByText("Product ID", { exact: true })
      .click();
    await expect(
      containsText(popover(page), "Aerodynamic Bronze Hat - 144").first(),
    ).toBeVisible();
  });
});

test.describe("issue 22482", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await editDashboard(page);
    await setFilter(page, "Date picker", "All Options");

    await page.getByText("Select…", { exact: true }).click();
    await popover(page).getByText(/Created At/).first().click();

    await saveDashboard(page);

    await filterWidget(page).click();
    await page.getByText("Relative date range…", { exact: true }).click();
  });

  test("should round relative date range (metabase#22482)", async ({
    page,
  }) => {
    const interval = page.getByLabel("Interval", { exact: true });
    await interval.fill("15");
    await page.getByRole("textbox", { name: "Unit", exact: true }).click();
    await page.getByText("months", { exact: true }).click();

    // dayjs().startOf("month").add(-15, "month") /
    // dayjs().add(-1, "month").endOf("month"), in plain Date math.
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 15, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    const expectedRange = `${formatMonthDayYear(start)} – ${formatMonthDayYear(end)}`;

    await expect(page.getByText(expectedRange, { exact: true })).toBeVisible();
  });
});

test.describe("issue 22788", () => {
  const ccName = "Custom Category";
  const ccDisplayName = "Products.Custom Category";

  const questionDetails = {
    name: "22788",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: { [ccName]: ["field", PRODUCTS.CATEGORY, null] },
      limit: 5,
    },
  };

  const filter = {
    name: "Text",
    slug: "text",
    id: "a7565817",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    name: "22788D",
    parameters: [filter],
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 6,
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["expression", ccName, null]],
            },
          ],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);
  });

  test("should not drop filter connected to a custom column on a second dashboard edit (metabase#22788)", async ({
    page,
  }) => {
    // addFilterAndAssert
    await filterWidget(page).click();
    const dropdown = dashboardParametersPopover(page);
    await fieldValuesCombobox(dropdown).pressSequentially("Gizmo");
    await dropdown
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(page.getByText("Gizmo", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Doohickey", { exact: true })).toHaveCount(0);

    await editDashboard(page);

    // openFilterSettings
    await editingFilterWidget(page).click();

    // Make sure the filter is still connected to the custom column
    const card = getDashboardCard(page);
    await expect(
      card.getByText("Column to filter on", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText(ccDisplayName, { exact: true })).toBeVisible();

    // need to actually change the dashboard to test a real save
    const labelInput = await inputWithValue(sidebar(page), "Text");
    await labelInput.fill("my filter text");
    await sidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await saveDashboard(page);

    await expect(page.getByText("Gizmo", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Doohickey", { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 24235", () => {
  const questionDetails = {
    query: { "source-table": PRODUCTS_ID, limit: 5 },
  };

  const parameter = {
    id: "727b06c1",
    name: "Date Filter",
    sectionId: "date",
    slug: "date_filter",
    type: "date/all-options",
  };

  const parameterTarget = [
    "dimension",
    ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
  ];

  const dashboardDetails = { parameters: [parameter] };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not allow to add a filter when all exclude options are selected (metabase#24235)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 24,
          size_y: 10,
          parameter_mappings: [
            {
              card_id: dashcard.card_id,
              parameter_id: parameter.id,
              target: parameterTarget,
            },
          ],
        },
      ],
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await filterWidget(page)
      .getByText(caseSensitiveSubstring(parameter.name))
      .click();
    const addPopover = popover(page);
    await addPopover.getByText("Exclude…", { exact: true }).click();
    await addPopover.getByText("Days of the week…", { exact: true }).click();
    await addPopover.getByText("Select all", { exact: true }).click();
    await addPopover.getByText("Add filter", { exact: true }).click();

    await filterWidget(page).click();
    const updatePopover = popover(page);
    await updatePopover.getByText("Select all", { exact: true }).click();
    await expect(
      updatePopover.getByRole("button", { name: "Update filter", exact: true }),
    ).toBeDisabled();
  });
});

test.describe("issues 15279 and 24500", () => {
  const listFilter = {
    name: "List",
    slug: "list",
    id: "6fe14171",
    type: "string/=",
    sectionId: "string",
  };

  const searchFilter = {
    name: "Search",
    slug: "search",
    id: "4db4913a",
    type: "string/=",
    sectionId: "string",
  };

  // Back when this issue was originally reported (around v47), it was enough
  // to have a filter without `name` and `slug` in order to corrupt it. The
  // invalid `type` and `sectionId` keep the filter corrupted today.
  const corruptedFilter = {
    name: "",
    slug: "",
    id: "af72ce9c",
    type: "string/=",
    sectionId: "bar",
  };

  const parameters = [listFilter, searchFilter, corruptedFilter];

  const questionDetails = {
    name: "15279",
    query: { "source-table": PEOPLE_ID, limit: 2 },
  };

  const dashboardDetails = { parameters };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("corrupted dashboard filter should still appear in the UI without breaking other filters (metabase#15279, metabase#24500)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    // Connect filters to the question
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 24,
          size_y: 8,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: listFilter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", PEOPLE.SOURCE, null]],
            },
            {
              parameter_id: searchFilter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", PEOPLE.NAME, null]],
            },
          ],
        },
      ],
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    const dashcardContainer = page.getByTestId("dashcard-container");

    // Make sure the list filter works
    await filterWidget(page).getByText(caseSensitiveSubstring("List")).click();
    const listPopover = dashboardParametersPopover(page);
    await listPopover.getByText("Organic", { exact: true }).click();
    await expect(listPopover.getByTestId("Organic-filter-value")).toBeChecked();
    await listPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(
      containsText(dashcardContainer, "Lora Cronin").first(),
    ).toBeVisible();
    await expect(
      containsText(dashcardContainer, "Dagmar Fay").first(),
    ).toBeVisible();

    // Make sure the search filter works
    await filterWidget(page)
      .getByText(caseSensitiveSubstring("Search"))
      .click();
    const searchPopover = dashboardParametersPopover(page);
    await searchPopover
      .getByPlaceholder("Search the list")
      .pressSequentially("Lora Cronin");
    await searchPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(
      containsText(dashcardContainer, "Lora Cronin").first(),
    ).toBeVisible();
    await expect(containsText(dashcardContainer, "Dagmar Fay")).toHaveCount(0);

    // Make sure the corrupted filter cannot connect to any field. The
    // corrupted filter is only visible when editing the dashboard.
    await editDashboard(page);
    await editingFilterWidget(page, "unnamed").click();
    await expect(
      containsText(
        page.getByTestId("parameter-mapper-container"),
        "No valid fields",
      ).first(),
    ).toBeVisible();

    // Remove the corrupted filter
    await dashboardParameterSidebar(page)
      .getByRole("button", { name: "Remove", exact: true })
      .click();

    // Make sure the UI updated before we save the dashboard
    await expect(
      containsText(dashcardContainer, "Lora Cronin").first(),
    ).toBeVisible();
    await expect(containsText(dashcardContainer, "Dagmar Fay")).toHaveCount(0);

    await saveDashboard(page);

    // Make sure the list filter still works
    await filterWidget(page)
      .getByText(caseSensitiveSubstring("Organic"))
      .click();
    await expect(
      dashboardParametersPopover(page).getByTestId("Organic-filter-value"),
    ).toBeChecked();
    // Close the popover before interacting with the other widget (the
    // Cypress original relied on its next click landing anyway).
    await page.keyboard.press("Escape");

    // Make sure the search filter still works — reset its value first
    const searchWidget = filterWidget(page).filter({
      hasText: caseSensitiveSubstring("Search"),
    });
    await searchWidget.hover();
    await icon(searchWidget, "close").click();
    await expect(
      containsText(dashcardContainer, "Lora Cronin").first(),
    ).toBeVisible();
    await expect(
      containsText(dashcardContainer, "Dagmar Fay").first(),
    ).toBeVisible();

    await filterWidget(page)
      .getByText(caseSensitiveSubstring("Search"))
      .click();
    const searchPopover2 = dashboardParametersPopover(page);
    await searchPopover2
      .getByPlaceholder("Search the list")
      .pressSequentially("Lora Cronin");
    await searchPopover2
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(
      containsText(dashcardContainer, "Lora Cronin").first(),
    ).toBeVisible();
    await expect(containsText(dashcardContainer, "Dagmar Fay")).toHaveCount(0);
  });
});

test.describe("issue 25322", () => {
  const parameterDetails = {
    name: "Location",
    slug: "location",
    id: "f8ec7c71",
    type: "string/=",
    sectionId: "location",
  };

  const questionDetails = {
    name: "People",
    query: { "source-table": PEOPLE_ID },
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show a loader when loading field values (metabase#25322)", async ({
    page,
    mb,
  }) => {
    const { id: cardId } = await createQuestion(mb.api, questionDetails);
    const { id: dashboardId } = await createDashboard(mb.api, dashboardDetails);
    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashboardId,
      card_id: cardId,
      card: {
        parameter_mappings: [
          {
            card_id: cardId,
            parameter_id: parameterDetails.id,
            target: ["dimension", ["field", PEOPLE.STATE, null]],
          },
        ],
      },
    });
    await visitDashboard(page, mb.api, dashboardId);

    // Upstream delays the values response by 100ms via intercept middleware;
    // 1s here so the retrying visibility check reliably catches the loader.
    await page.route(
      `**/api/dashboard/${dashboardId}/params/${parameterDetails.id}/values`,
      async (route) => {
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fulfill({ response });
      },
    );

    await page.getByText(parameterDetails.name, { exact: true }).click();
    await expect(
      popover(page).getByTestId("loading-indicator"),
    ).toBeVisible();
  });
});

test.describe("issue 25248", () => {
  const question1Details = {
    name: "Q1",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  const question2Details = {
    name: "Q2",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["avg"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  const parameterDetails = {
    name: "Date Filter",
    slug: "date_filter",
    id: "888188ad",
    type: "date/all-options",
    sectionId: "date",
  };

  const dashboardDetails = {
    name: "25248",
    parameters: [parameterDetails],
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow mapping parameters to combined cards individually (metabase#25248)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: question1Details,
      dashboardDetails,
    });
    const { id: card2Id } = await createQuestion(mb.api, question2Details);
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          series: [{ id: card2Id }],
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
        },
      ],
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);
    await editDashboard(page);

    await page.getByText(parameterDetails.name, { exact: true }).click();
    await page.getByText("Select…", { exact: true }).first().click();
    await popover(page).getByText("Created At", { exact: true }).first().click();

    await expect(
      page.getByText("Orders.Created At", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Select…", { exact: true })).toBeVisible();
  });
});

test.describe("issue 25374", () => {
  const questionDetails = {
    name: "25374",
    native: {
      "template-tags": {
        num: {
          id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
          name: "num",
          "display-name": "Num",
          type: "number",
          default: null,
        },
      },
      query: "select count(*) from orders where id in ({{num}})",
    },
    parameters: [
      {
        id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
        type: "number/=",
        target: ["variable", ["template-tag", "num"]],
        name: "Num",
        slug: "num",
        default: null,
      },
    ],
  };

  const filterDetails = {
    name: "Equal to",
    slug: "equal_to",
    id: "10c0d4ba",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    name: "25374D",
    parameters: [filterDetails],
  };

  let dashboardId: number;
  let dashcardQueryRe: RegExp;
  const cardQueryRe = /^\/api\/card\/\d+\/query$/;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    dashboardId = dashcard.dashboard_id;
    // Connect filter to the card
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 6,
          parameter_mappings: [
            {
              parameter_id: filterDetails.id,
              card_id: dashcard.card_id,
              target: ["variable", ["template-tag", "num"]],
            },
          ],
        },
      ],
    });
    dashcardQueryRe = new RegExp(
      `^/api/dashboard/${dashboardId}/dashcard/\\d+/card/\\d+/query$`,
    );

    await visitDashboard(page, mb.api, dashboardId);
    await expect.poll(urlSearch(page)).toBe("?equal_to=");

    const widgetInput = filterWidget(page).locator("input");
    const filteredQuery = waitForResponseMatching(page, "POST", dashcardQueryRe);
    await widgetInput.click();
    await widgetInput.pressSequentially("1,2,3");
    await widgetInput.press("Enter");
    await filteredQuery;

    const cardVisualization = page.locator(".CardVisualization");
    await expect(
      containsText(cardVisualization, "COUNT(*)").first(),
    ).toBeVisible();
    await expect(containsText(cardVisualization, "3").first()).toBeVisible();
    await expect(widgetInput).toHaveValue("1,2,3");

    await expect.poll(urlSearch(page)).toBe("?equal_to=1%2C2%2C3");
  });

  // 25374-1/-3/-4 are fixme'd: the drill-through from the dashcard to the
  // question does not produce a result table (25374-2, which only reloads the
  // dashboard, passes). Verified 2026-07-17: the ORIGINAL Cypress spec fails
  // identically against this same backend, at the same assertions — -1 and -4
  // on `[data-testid="table-header"]`, -3 on `[data-testid=cell-data]`. Not a
  // porting defect; cause not established (snapshot staleness ruled out), CI
  // behavior unverified from this spec.
  test("should pass comma-separated values down to the connected question (metabase#25374-1)", async ({
    page,
  }) => {
    // Drill-through and go to the question
    const cardQuery = waitForResponseMatching(page, "POST", cardQueryRe);
    await getDashboardCard(page, 0)
      .getByText(questionDetails.name, { exact: true })
      .click();
    await cardQuery;

    // Upstream is `H.tableInteractiveHeader("COUNT(*)")` — that helper takes no
    // arguments, so the string is ignored and only the header's existence is
    // asserted. Kept faithful rather than "fixed" into a text assertion.
    await expect(page.getByTestId("table-header")).toBeVisible();
    await expect(
      tableInteractiveBody(page).getByText("3", { exact: true }).first(),
    ).toBeVisible();

    await expect.poll(urlSearch(page)).toBe("?num=1%2C2%2C3");
  });

  test("should retain comma-separated values on refresh (metabase#25374-2)", async ({
    page,
  }) => {
    await page.reload();

    // Make sure the filter widget still has all the values
    await expect(filterWidget(page).locator("input")).toHaveValue("1,2,3");

    // Make sure the result in the card is correct
    const cardVisualization = page.locator(".CardVisualization");
    await expect(
      containsText(cardVisualization, "COUNT(*)").first(),
    ).toBeVisible();
    await expect(containsText(cardVisualization, "3").first()).toBeVisible();

    // Make sure URL search params are correct
    await expect.poll(urlSearch(page)).toBe("?equal_to=1%2C2%2C3");
  });

  test("should retain comma-separated values when reverting to default (metabase#25374-3)", async ({
    page,
  }) => {
    await editDashboard(page);
    await editingParametersContainer(page)
      .getByText("Equal to", { exact: true })
      .click();
    await dashboardParameterSidebar(page)
      // "Default value" labels a wrapper <div> (aria-labelledby), not the
      // control: the ParameterValueWidget input inside it carries no
      // accessible name of its own. Typing at the div is a no-op, leaving the
      // dashboard un-dirtied so saveDashboard's PUT never fires — reach the
      // input through the labelled wrapper.
      .getByLabel("Default value", { exact: true })
      .locator("input")
      .pressSequentially("1,2,3");

    await saveDashboard(page);
    await expect.poll(urlSearch(page)).toBe("?equal_to=1%2C2%2C3");
    await expect(
      getDashboardCard(page).getByTestId("table-body").getByTestId("cell-data"),
    ).toHaveText("3");

    // Upstream waits on "@dashcardQuery" after these clicks, but cy.wait
    // consumes an *already-recorded* response from the alias's backlog (the
    // beforeEach and save both filled it), so it does not gate on a new
    // request — and clearing to an empty value fires none. A waitForResponse
    // here would hang; the retried assertions below are the real check.
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(
      containsText(
        getDashboardCard(page),
        "There was a problem displaying this chart.",
      ).first(),
    ).toBeVisible();
    await expect.poll(urlSearch(page)).toBe("?equal_to=");

    await page
      .getByRole("button", { name: "Reset filter to default state", exact: true })
      .click();
    await expect(
      getDashboardCard(page).getByTestId("table-body").getByTestId("cell-data"),
    ).toHaveText("3");
    await expect.poll(urlSearch(page)).toBe("?equal_to=1%2C2%2C3");

    // Drill-through and go to the question. As above, the upstream
    // cy.wait("@cardQuery") is backlog-consuming rather than a real gate, so
    // the retried assertions below stand in for it.
    await getDashboardCard(page, 0)
      .getByText(questionDetails.name, { exact: true })
      .click();

    await expect(
      page.getByTestId("cell-data").filter({ hasText: /COUNT\(\*\)/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("cell-data").filter({ hasText: /3/ }).first(),
    ).toBeVisible();

    await expect.poll(urlSearch(page)).toBe("?num=1%2C2%2C3");
  });

  test("should retain comma-separated values when reverting to default via 'Reset all filters' (metabase#25374-4)", async ({
    page,
  }) => {
    await editDashboard(page);
    await editingParametersContainer(page)
      .getByText("Equal to", { exact: true })
      .click();
    await dashboardParameterSidebar(page)
      // "Default value" labels a wrapper <div> (aria-labelledby), not the
      // control: the ParameterValueWidget input inside it carries no
      // accessible name of its own. Typing at the div is a no-op, leaving the
      // dashboard un-dirtied so saveDashboard's PUT never fires — reach the
      // input through the labelled wrapper.
      .getByLabel("Default value", { exact: true })
      .locator("input")
      .pressSequentially("1,2,3");
    await saveDashboard(page);
    await expect.poll(urlSearch(page)).toBe("?equal_to=1%2C2%2C3");
    await expect(
      getDashboardCard(page).getByTestId("table-body").getByTestId("cell-data"),
    ).toHaveText("3");

    // See 25374-3: the upstream "@dashcardQuery" waits consume backlog rather
    // than gating on a new request, and clearing fires none.
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect.poll(urlSearch(page)).toBe("?equal_to=");
    await expect(
      containsText(
        getDashboardCard(page),
        "There was a problem displaying this chart.",
      ).first(),
    ).toBeVisible();

    await page.getByLabel("Move, trash, and more…").click();
    await popover(page)
      .getByText("Reset all filters", { exact: true })
      .click();
    await expect.poll(urlSearch(page)).toBe("?equal_to=1%2C2%2C3");
    await expect(
      getDashboardCard(page).getByTestId("table-body").getByTestId("cell-data"),
    ).toHaveText("3");

    // Drill-through and go to the question. As above, the upstream
    // cy.wait("@cardQuery") is backlog-consuming rather than a real gate, so
    // the retried assertions below stand in for it.
    await getDashboardCard(page, 0)
      .getByText(questionDetails.name, { exact: true })
      .click();

    // Upstream is H.tableHeaderColumn("COUNT(*)"), which does assert the text
    // (unlike tableInteractiveHeader in 25374-1).
    await expect(
      page.getByTestId("table-header").getByText("COUNT(*)", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractiveBody(page).getByTestId("cell-data"),
    ).toHaveText("3");

    await expect.poll(urlSearch(page)).toBe("?num=1%2C2%2C3");
  });
});

test.describe("issue 25908", () => {
  const questionDetails = {
    name: "25908",
    query: { "source-table": PRODUCTS_ID },
  };

  const dashboardFilter = {
    name: "Text contains",
    slug: "text_contains",
    id: "28c6ada9",
    type: "string/contains",
    sectionId: "string",
  };

  const dashboardDetails = { parameters: [dashboardFilter] };

  const CASE_INSENSITIVE_ROWS = 30;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 17,
          size_y: 30,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: dashboardFilter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", PRODUCTS.TITLE, null]],
            },
          ],
        },
      ],
    });

    // Note the capital first letter
    const dashcardQuery = waitForResponseMatching(
      page,
      "POST",
      new RegExp(
        `^/api/dashboard/${dashcard.dashboard_id}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query$`,
      ),
    );
    await page.goto(`/dashboard/${dashcard.dashboard_id}?text_contains=Li`);
    await dashcardQuery;
    await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(
      CASE_INSENSITIVE_ROWS,
    );
  });

  test("`contains` dashboard filter should respect case insensitivity on a title-drill-through (metabase#25908)", async ({
    page,
  }) => {
    const dataset = waitForResponseMatching(page, "POST", /^\/api\/dataset$/);
    await page.getByText(questionDetails.name, { exact: true }).click();
    await dataset;

    await expect(
      page.getByText("Title contains Li", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`Showing ${CASE_INSENSITIVE_ROWS} rows`, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 26230, issue 27356", () => {
  const FILTER = {
    id: "12345678",
    name: "Text",
    slug: "text",
    type: "string/=",
    sectionId: "string",
  };

  const PARAM_DASHBOARD = "dashboard with a tall card";
  const REGULAR_DASHBOARD = "dashboard without params";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // A bookmarked dashboard *without* any parameters — the switch target
    // that preserves the parameterized -> non-parameterized check
    // (metabase#27356).
    const { id: regularId } = await createDashboard(mb.api, {
      name: REGULAR_DASHBOARD,
    });
    await mb.api.post(`/api/bookmark/dashboard/${regularId}`);

    // A bookmarked dashboard *with* a parameter and a tall mapped card. We
    // start here so the param widget can become sticky once scrolled
    // (metabase#26230).
    const { id: paramDashboardId } = await createDashboard(mb.api, {
      name: PARAM_DASHBOARD,
      parameters: [FILTER],
    });
    await mb.api.put(`/api/dashboard/${paramDashboardId}`, {
      dashcards: [
        {
          id: -paramDashboardId,
          dashboard_id: paramDashboardId,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 5,
          size_y: 20,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: FILTER.id,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                [
                  "field",
                  PEOPLE.NAME,
                  { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
                ],
              ],
            },
          ],
        },
      ],
    });
    await mb.api.post(`/api/bookmark/dashboard/${paramDashboardId}`);
    await visitDashboard(page, mb.api, paramDashboardId);
  });

  test("should not preserve sticky filter behavior and should switch from a parameterized to a non-parameterized dashboard without error (metabase#26230, metabase#27356)", async ({
    page,
  }) => {
    // This scroll is essential for the reproduction!
    await page
      .getByRole("main")
      .evaluate((main) => main.scrollTo(0, main.scrollHeight));

    await page.getByRole("button", { name: "Toggle sidebar" }).click();

    // The dashboard title has scrolled out of the scrolling <main>. Cypress's
    // "not.be.visible" catches that clipping; Playwright's toBeVisible() does
    // not, so compare rects against the scroll container.
    const main = page.getByRole("main");
    const titleInput = await findByDisplayValue(main, PARAM_DASHBOARD);
    await expect
      .poll(() => isClippedByScrollContainer(titleInput, main))
      .toBe(true);

    await expect(dashboardParametersContainer(page)).toHaveCSS(
      "position",
      "sticky",
    );

    // Switching from the parameterized dashboard to the non-parameterized one
    // via the navigation sidebar should load cleanly, without erroring
    // (metabase#27356).
    const loadDashboard = waitForResponseMatching(
      page,
      "GET",
      /^\/api\/dashboard\/\d+$/,
    );
    await page.getByRole("listitem", { name: REGULAR_DASHBOARD }).click();
    await loadDashboard;

    const regularTitleInput = await findByDisplayValue(
      page.getByRole("main"),
      REGULAR_DASHBOARD,
    );
    await expect(regularTitleInput).toBeVisible();
    await expect(
      page.getByText("This dashboard is empty", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 27768", () => {
  const questionDetails = {
    name: "27768",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 5,
      expressions: { CCategory: ["field", PRODUCTS.CATEGORY, null] },
    },
  };

  const filter = {
    name: "Cat",
    slug: "cat",
    id: "b3b436dd",
    type: "string/=",
    sectionId: "string",
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
    });
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      parameters: [filter],
    });

    await visitDashboardWithParams(page, mb.api, dashcard.dashboard_id, {
      cat: "Gizmo",
    });
  });

  test("filter connected to custom column should visually indicate it is connected (metabase#27768)", async ({
    page,
  }) => {
    // We need to manually connect the filter to the custom column using the
    // UI, but when the issue is fixed it should be safe to do via the API
    await editDashboard(page);
    await editingFilterWidget(page, filter.name).click();

    await getDashboardCard(page).getByText("Select…", { exact: true }).click();
    await containsText(popover(page), "CCategory").first().click();
    await saveDashboard(page);

    await filterWidget(page).click();
    const dropdown = dashboardParametersPopover(page);
    await fieldValuesCombobox(dropdown).pressSequentially("Gizmo");
    await dropdown
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(page.getByText("Doohickey", { exact: true })).toHaveCount(0);

    // Make sure the filter is still connected to the custom column
    await editDashboard(page);
    await editingFilterWidget(page, filter.name).click();

    const card = getDashboardCard(page);
    await expect(card.getByText("Select…", { exact: true })).toHaveCount(0);
    await expect(
      containsText(card, "Products.CCategory").first(),
    ).toBeVisible();
  });
});

test.describe("issues 29347, 29346", () => {
  const filterValue = 100;

  const filterDetails = {
    name: "Text",
    slug: "text",
    id: "11d79abe",
    type: "string/=",
    sectionId: "string",
  };

  const questionDetails = {
    query: { "source-table": ORDERS_ID },
  };

  const editableDashboardDetails = {
    parameters: [filterDetails],
    enable_embedding: true,
    embedding_params: {
      [filterDetails.slug]: "enabled",
    },
  };

  const lockedDashboardDetails = {
    parameters: [filterDetails],
    enable_embedding: true,
    embedding_params: {
      [filterDetails.slug]: "locked",
    },
  };

  const getRemappedValue = (fieldValue: number) => `N${fieldValue}`;

  const addFieldRemapping = async (mb: Harness, fieldId: number) => {
    await mb.api.put(`/api/field/${fieldId}`, {
      semantic_type: "type/Category",
    });
    await mb.api.post(`/api/field/${fieldId}/dimension`, {
      name: "Quantity",
      type: "internal",
    });
    const { values } = (await (
      await mb.api.get(`/api/field/${fieldId}/values`)
    ).json()) as { values: [number][] };
    await mb.api.post(`/api/field/${fieldId}/values`, {
      values: values.map(([value]) => [value, getRemappedValue(value)]),
    });
  };

  const createRemappedDashboard = async (
    mb: Harness,
    dashboardDetails = editableDashboardDetails,
  ): Promise<number> => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await mb.api.put(`/api/dashboard/${dashcard.dashboard_id}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 24,
          size_y: 10,
          parameter_mappings: [
            {
              parameter_id: filterDetails.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", ORDERS.QUANTITY, null]],
            },
          ],
        },
      ],
    });
    return dashcard.dashboard_id;
  };

  const filterOnRemappedValues = async (
    page: Page,
    cardQuery: Promise<unknown>,
  ) => {
    await filterWidget(page)
      .getByText(filterDetails.name, { exact: true })
      .click();
    const dropdown = popover(page);
    await dropdown
      .getByText(getRemappedValue(filterValue), { exact: true })
      .click();
    await dropdown
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await cardQuery;
  };

  const verifyRemappedFilterValues = async (page: Page) => {
    await expect(
      filterWidget(page).getByText(getRemappedValue(filterValue), {
        exact: true,
      }),
    ).toBeVisible();
  };

  const verifyRemappedCardValues = async (page: Page) => {
    await expect(
      getDashboardCard(page).getByText(getRemappedValue(filterValue), {
        exact: true,
      }),
    ).toHaveCount(2);
  };

  const verifyRemappedValues = async (page: Page) => {
    await verifyRemappedFilterValues(page);
    await verifyRemappedCardValues(page);
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await addFieldRemapping(mb, ORDERS.QUANTITY);
  });

  test.describe("regular dashboards", () => {
    const cardQueryRe = /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/;

    test("should be able to filter on remapped values (metabase#29347, metabase#29346)", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createRemappedDashboard(mb);
      await visitDashboard(page, mb.api, dashboardId);

      const cardQuery = waitForResponseMatching(page, "POST", cardQueryRe);
      await filterOnRemappedValues(page, cardQuery);

      await verifyRemappedValues(page);
    });

    test("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createRemappedDashboard(mb);
      await visitDashboardWithParams(page, mb.api, dashboardId, {
        [filterDetails.slug]: filterValue,
      });

      await verifyRemappedValues(page);
    });
  });

  test.describe("embedded dashboards", () => {
    const dashboardRe = /^\/api\/embed\/dashboard\/[^/]+$/;
    const cardQueryRe = /^\/api\/embed\/dashboard\/.+\/card\/\d+$/;

    test("should be able to filter on remapped values (metabase#29347, metabase#29346)", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createRemappedDashboard(mb);
      const dashboardLoad = waitForResponseMatching(page, "GET", dashboardRe);
      const cardQuery = waitForResponseMatching(page, "GET", cardQueryRe);
      await visitEmbeddedDashboard(page, mb, {
        resource: { dashboard: dashboardId },
        params: {},
      });
      await Promise.all([dashboardLoad, cardQuery]);

      const filteredQuery = waitForResponseMatching(page, "GET", cardQueryRe);
      await filterOnRemappedValues(page, filteredQuery);

      await verifyRemappedValues(page);
    });

    test("should be able to filter on remapped values in the token (metabase#29347, metabase#29346)", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createRemappedDashboard(
        mb,
        lockedDashboardDetails,
      );
      const dashboardLoad = waitForResponseMatching(page, "GET", dashboardRe);
      const cardQuery = waitForResponseMatching(page, "GET", cardQueryRe);
      await visitEmbeddedDashboard(page, mb, {
        resource: { dashboard: dashboardId },
        params: { [filterDetails.slug]: filterValue },
      });
      await Promise.all([dashboardLoad, cardQuery]);

      await verifyRemappedCardValues(page);
    });

    test("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createRemappedDashboard(mb);
      const dashboardLoad = waitForResponseMatching(page, "GET", dashboardRe);
      const cardQuery = waitForResponseMatching(page, "GET", cardQueryRe);
      await visitEmbeddedDashboard(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { setFilters: { [filterDetails.slug]: filterValue } },
      );
      await Promise.all([dashboardLoad, cardQuery]);

      await verifyRemappedValues(page);
    });
  });

  test.describe("public dashboards", () => {
    const dashboardRe = /^\/api\/public\/dashboard\/[^/]+$/;
    const cardQueryRe = /^\/api\/public\/dashboard\/.+\/card\/\d+$/;

    test("should be able to filter on remapped values (metabase#29347, metabase#29346)", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createRemappedDashboard(mb);
      const dashboardLoad = waitForResponseMatching(page, "GET", dashboardRe);
      const cardQuery = waitForResponseMatching(page, "GET", cardQueryRe);
      await visitPublicDashboard(page, mb, dashboardId);
      await Promise.all([dashboardLoad, cardQuery]);

      const filteredQuery = waitForResponseMatching(page, "GET", cardQueryRe);
      await filterOnRemappedValues(page, filteredQuery);

      await verifyRemappedValues(page);
    });

    test("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createRemappedDashboard(mb);
      const dashboardLoad = waitForResponseMatching(page, "GET", dashboardRe);
      const cardQuery = waitForResponseMatching(page, "GET", cardQueryRe);
      await visitPublicDashboard(page, mb, dashboardId, {
        params: { [filterDetails.slug]: String(filterValue) },
      });
      await Promise.all([dashboardLoad, cardQuery]);

      await verifyRemappedValues(page);
    });
  });
});

test.describe("issue 31662", () => {
  const parameterDetails = {
    name: "Between",
    slug: "between",
    id: "b6ed2d71",
    type: "number/between",
    sectionId: "number",
    default: [3, 5],
  };
  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow setting default values for a not connected between filter (metabase#31662)", async ({
    page,
    mb,
  }) => {
    const { id: dashboardId } = await createDashboard(mb.api, dashboardDetails);
    const dashboardLoad = waitForResponseMatching(
      page,
      "GET",
      new RegExp(`^/api/dashboard/${dashboardId}$`),
    );
    await page.goto(`/dashboard/${dashboardId}?between=10&between=20`);
    await dashboardLoad;

    await expect(page.getByTestId("dashboard-empty-state")).toBeVisible();
    await editDashboard(page);
    await editingParametersContainer(page)
      .getByText("Between", { exact: true })
      .click();
    await sidebar(page).getByText("2 selections", { exact: true }).click();
    const valuesPopover = popover(page);
    await expect(await inputWithValue(valuesPopover, "3")).toBeVisible();
    await expect(await inputWithValue(valuesPopover, "5")).toBeVisible();
  });
});

test.describe("issue 38245", () => {
  const TAB_1 = { id: 1, name: "Tab 1" };
  const TAB_2 = { id: 2, name: "Tab 2" };

  // createMockParameter fields the API cares about.
  const DASHBOARD_TEXT_FILTER = {
    id: "3",
    name: "Text filter",
    slug: "filter-text",
    type: "string/contains",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not make a request to the server if the parameters are not saved (metabase#38245)", async ({
    page,
    mb,
  }) => {
    const cardQueryRe = /^\/api\/card\/\d+\/query$/;
    const cardQueries = trackResponses(page, "POST", cardQueryRe);
    const cardQueryStatuses: number[] = [];
    page.on("response", (response) => {
      if (
        response.request().method() === "POST" &&
        cardQueryRe.test(new URL(response.url()).pathname)
      ) {
        cardQueryStatuses.push(response.status());
      }
    });

    const dashboard = await createDashboardWithTabs(mb.api, {
      tabs: [TAB_1, TAB_2],
      parameters: [DASHBOARD_TEXT_FILTER],
      dashcards: [],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    await editDashboard(page);
    await openQuestionsSidebar(page);

    const firstCardQuery = waitForResponseMatching(page, "POST", cardQueryRe);
    await sidebar(page).getByText("Orders", { exact: true }).click();
    await firstCardQuery;

    // mapDashCardToFilter
    await editingParametersContainer(page)
      .getByText(DASHBOARD_TEXT_FILTER.name, { exact: true })
      .click();
    await selectDashboardFilter(getDashboardCard(page), "Source");
    await sidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await goToTab(page, TAB_2.name);
    await goToTab(page, TAB_1.name);

    const card = getDashboardCard(page);
    await expect(card.getByText("Orders", { exact: true })).toBeVisible();
    await expect(card.getByText("Product ID", { exact: true })).toBeVisible();
    await expect(card.getByText(/Problem|Error/i)).toHaveCount(0);

    await expect.poll(() => cardQueries()).toBe(2);
    expect(cardQueryStatuses).not.toContain(500);
  });
});

test.describe("issue 43154", () => {
  const modelDetails = {
    name: "Model",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          alias: "People - User",
          condition: [
            "=",
            ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }],
            [
              "field",
              PEOPLE.ID,
              { "base-type": "type/BigInteger", "join-alias": "People - User" },
            ],
          ],
          "source-table": PEOPLE_ID,
        },
      ],
    },
  };

  const questionDetails = (modelId: number) => ({
    name: "Question",
    type: "question",
    query: { "source-table": `card__${modelId}` },
  });

  const questionWithAggregationDetails = (modelId: number) => ({
    name: "Question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
      aggregation: [["count"]],
    },
  });

  async function verifyNestedFilter(
    page: Page,
    api: MetabaseApi,
    getQuestionDetails: (modelId: number) => {
      name: string;
      type: string;
      query: Record<string, unknown>;
    },
  ) {
    const model = await createQuestion(api, modelDetails);
    const { dashboard } = await createDashboardWithQuestions(api, {
      questions: [getQuestionDetails(model.id)],
    });
    await visitDashboard(page, api, dashboard.id);

    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await getDashboardCard(page).getByText("Select…", { exact: true }).click();
    await popover(page)
      .getByText("People - User → Source", { exact: true })
      .click();
    await saveDashboard(page);

    await filterWidget(page).click();
    const dropdown = dashboardParametersPopover(page);
    await dropdown.getByText("Twitter", { exact: true }).click();
    await dropdown
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    // (Assert the value applied — the upstream test ends on the click.)
    await expect(
      filterWidget(page).getByText("Twitter", { exact: true }),
    ).toBeVisible();
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to see field values with a model-based question (metabase#43154)", async ({
    page,
    mb,
  }) => {
    await verifyNestedFilter(page, mb.api, questionDetails);
  });

  test("should be able to see field values with a model-based question with aggregation (metabase#43154)", async ({
    page,
    mb,
  }) => {
    await verifyNestedFilter(page, mb.api, questionWithAggregationDetails);
  });
});

test.describe("issue 42829", () => {
  const modelDetails = {
    name: "SQL model",
    type: "model",
    native: { query: "SELECT * FROM PEOPLE" },
  };

  const stateFieldDetails = {
    id: PEOPLE.STATE,
    display_name: "State",
    semantic_type: "type/State",
  };

  const getQuestionDetails = (modelId: number) => ({
    name: "SQL model-based question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
      aggregation: [
        ["distinct", ["field", "STATE", { "base-type": "type/Text" }]],
      ],
    },
    display: "scalar",
  });

  const parameterDetails = {
    name: "State",
    slug: "state",
    id: "5aefc725",
    type: "string/=",
    sectionId: "location",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  const getParameterMapping = (questionId: number) => ({
    parameter_id: parameterDetails.id,
    card_id: questionId,
    target: ["dimension", ["field", "STATE", { "base-type": "type/Text" }]],
  });

  let dashboardId: number;

  async function filterAndVerifyResults(page: Page) {
    await filterWidget(page).click();
    const dropdown = popover(page);
    await dropdown.getByText("AK", { exact: true }).click();
    await dropdown.getByText("AR", { exact: true }).click();
    await dropdown
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await expect(getDashboardCard(page).getByTestId("scalar-value")).toHaveText(
      "2",
    );
  }

  async function drillAndVerifyResults(page: Page) {
    await getDashboardCard(page)
      .getByText("SQL model-based question", { exact: true })
      .click();
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("State is 2 selections", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("scalar-value")).toHaveText("2");
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const model = await createNativeQuestion(mb.api, modelDetails);
    // populate result_metadata
    await mb.api.post(`/api/card/${model.id}/query`);
    await setModelMetadata(mb.api, model.id, (field) => {
      if (field.display_name === "STATE") {
        return { ...field, ...stateFieldDetails };
      }
      return field;
    });
    const {
      dashboard,
      questions: [question],
    } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails,
      questions: [getQuestionDetails(model.id)],
    });
    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: question.id,
          parameter_mappings: [getParameterMapping(question.id)],
        },
      ],
    });
    dashboardId = dashboard.id;
  });

  test("should be able to get field values coming from a sql model-based question in a regular dashboard (metabase#42829)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, dashboardId);
    await filterAndVerifyResults(page);
    await drillAndVerifyResults(page);
  });

  test("should be able to get field values coming from a sql model-based question in a public dashboard (metabase#42829)", async ({
    page,
    mb,
  }) => {
    await visitPublicDashboard(page, mb, dashboardId);
    await filterAndVerifyResults(page);
  });

  test("should be able to get field values coming from a sql model-based question in a embedded dashboard (metabase#42829)", async ({
    page,
    mb,
  }) => {
    await visitEmbeddedDashboard(page, mb, {
      resource: { dashboard: dashboardId },
      params: {},
    });
    await filterAndVerifyResults(page);
  });
});
