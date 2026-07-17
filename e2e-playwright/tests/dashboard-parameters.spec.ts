/**
 * Playwright port of e2e/test/scenarios/dashboard-filters/parameters.cy.spec.js
 *
 * Snowplow helpers are no-op stubs (no snowplow-micro container in the spike
 * harness); the UI flows those events decorate are ported for real.
 *
 * Deviations from the original, both in "should remove filters correctly"
 * (question dashcards): the `findByText("Count").should("not.exist")` check
 * was a timing false-pass upstream (the chart's y-axis label "Count" renders
 * as DOM text once the chart paints) — ported as "the unmapped Count filter
 * widget is hidden", which is the stated intent.
 */
import type { Page } from "@playwright/test";

import {
  dashboardHeader,
  editBar,
  editDashboard,
  getDashboardCard,
  modal,
  saveDashboard,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { icon, inputWithValue } from "../support/dashboard-cards";
import {
  createDashboardWithTabs,
  createNewTab,
  dashboardParametersPopover,
  removeDashboardCard,
  updateDashboardCards,
} from "../support/dashboard-core";
import {
  addHeadingWhileEditing,
  applyFilterButton,
  clearFilterWidget,
  countRequests,
  createDashboard,
  createDashboardWithQuestions,
  createNativeQuestionAndDashboard,
  createQuestionAndDashboard,
  dashboardParameterSidebar,
  dashboardParametersContainer,
  disconnectDashboardFilter,
  editingDashboardParametersContainer,
  expectFilterSelected,
  expectRenderedWithinViewport,
  filterWidget,
  goToTab,
  isDashcardQueryRequest,
  mockHeadingDashboardCard,
  mockParameter,
  mockQuestionDashboardCard,
  mockTextDashboardCard,
  mockVirtualCard,
  moveDashCardToTab,
  moveDashboardFilter,
  selectDashboardFilter,
  setDashboardParameterName,
  setDashboardParameterOperator,
  setDashboardParameterType,
  setDashCardFilter,
  undo,
  waitForDashboardPut,
} from "../support/dashboard-parameters";
import type { RequestCounter } from "../support/dashboard-parameters";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { fieldValuesCombobox } from "../support/native-filters";
import {
  openDashboardMenu,
  ORDERS_COUNT_QUESTION_ID,
} from "../support/organization";
import { tableInteractiveBody } from "../support/question-new";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  visitEmbeddedPage,
  visitPublicDashboard,
} from "../support/question-saved";
import {
  openQuestionsSidebar,
  saveDashboardWithoutAwaitingRequests,
} from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { isScrollableHorizontally } from "../support/search";
import { popover, visitDashboard } from "../support/ui";

const { ORDERS_ID, ORDERS, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

// TODO: no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

/** Port of cy.location("search").should("eq", …) — retried, not one-shot. */
const expectSearch = (page: Page, search: string) =>
  expect.poll(() => new URL(page.url()).search).toBe(search);

/** The dashboard-save PUT payload shape these tests assert on. */
type DashboardPutPayload = {
  parameters: unknown[];
  dashcards: {
    card_id: number | null;
    inline_parameters: unknown[];
    parameter_mappings: { parameter_id: string }[];
  }[];
};

test.describe("scenarios > dashboard > parameters", () => {
  const cards = [
    {
      card_id: ORDERS_COUNT_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 5,
      size_y: 4,
    },
    {
      card_id: ORDERS_COUNT_QUESTION_ID,
      row: 0,
      col: 5,
      size_x: 5,
      size_y: 4,
    },
  ];

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to remove parameter (metabase#17933)", async ({
    page,
    mb,
  }) => {
    // Mirrored issue in metabase-enterprise#275

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const startsWith = {
      name: "Text starts with",
      slug: "text_starts_with",
      id: "1b9cd9f1",
      type: "string/starts-with",
      sectionId: "string",
    };

    const endsWith = {
      name: "Text ends with",
      slug: "text_ends_with",
      id: "88a1257c",
      type: "string/ends-with",
      sectionId: "string",
    };

    const { cardId, dashboardId, dashcardId } =
      await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails: { parameters: [startsWith, endsWith] },
      });

    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        {
          id: dashcardId,
          card_id: cardId,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          series: [],
          visualization_settings: {},
          parameter_mappings: [startsWith, endsWith].map((parameter) => ({
            parameter_id: parameter.id,
            card_id: cardId,
            target: [
              "dimension",
              [
                "field",
                PRODUCTS.CATEGORY,
                { "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
          })),
        },
      ],
    });

    await visitDashboard(page, mb.api, dashboardId);
    await expect(page.getByTestId("table-header")).toBeVisible();

    await page.getByText(startsWith.name, { exact: true }).click();
    await popover(page)
      .getByPlaceholder("Enter some text")
      .pressSequentially("G");
    // Make sure the dropdown list with values is not populated,
    // because it makes no sense for non-exact parameter string operators.
    // See: https://github.com/metabase/metabase/pull/15477
    await expect(popover(page).getByText("Gizmo", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      popover(page).getByText("Gadget", { exact: true }),
    ).toHaveCount(0);

    await popover(page).getByRole("button", { name: "Add filter" }).click();

    await expectSearch(page, `?${endsWith.slug}=&${startsWith.slug}=G`);
    await expect(page.getByText("37.65", { exact: true })).toHaveCount(0);

    await page.getByText(endsWith.name, { exact: true }).click();
    await popover(page)
      .getByPlaceholder("Enter some text")
      .pressSequentially("zmo");
    await expect(popover(page).getByText("Gizmo", { exact: true })).toHaveCount(
      0,
    );

    await popover(page).getByRole("button", { name: "Add filter" }).click();

    await expectSearch(page, `?${endsWith.slug}=zmo&${startsWith.slug}=G`);
    await expect(page.getByText("52.72", { exact: true })).toHaveCount(0);

    // Remove filter (metabase#17933)
    await editDashboard(page);
    await filterWidget(page, { isEditing: true, name: startsWith.name }).click();

    await dashboardParameterSidebar(page)
      .getByRole("button", { name: "Remove" })
      .click();
    await expectSearch(page, `?${endsWith.slug}=zmo`);

    await saveDashboard(page);

    // There should only be one filter remaining and its value is preserved
    await expect(
      filterWidget(page).filter({ hasText: new RegExp(endsWith.name, "i") }),
    ).toBeVisible();

    await expectSearch(page, `?${endsWith.slug}=zmo`);
  });

  test("should handle mismatch between filter types (metabase#9299, metabase#16181)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "16181",
      native: {
        query: "select count(*) from products where {{filter}}",
        "template-tags": {
          filter: {
            id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
            name: "filter",
            "display-name": "Native Filter",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "string/=",
            default: null,
          },
        },
      },
      display: "scalar",
    };

    const matchingFilterType = {
      name: "Text",
      slug: "text",
      id: "d245671f",
      type: "string/=",
      sectionId: "string",
      default: "Gadget",
    };

    const { cardId, dashboardId, dashcardId } =
      await createNativeQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails: { parameters: [matchingFilterType] },
      });

    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        {
          id: dashcardId,
          card_id: cardId,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 6,
          parameter_mappings: [
            {
              parameter_id: matchingFilterType.id,
              card_id: cardId,
              target: [
                "dimension",
                ["template-tag", "filter"],
                { "stage-number": 0 },
              ],
            },
          ],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashboardId);
    await expect(page.getByTestId("scalar-value")).toHaveText("53");

    // Confirm you can't map wrong parameter type the native question's field filter (metabase#16181)
    await editDashboard(page);

    await setFilter(page, "ID");

    await expect(
      page.getByText(/Add a variable to this question/),
    ).toBeVisible();

    // Confirm that the correct parameter type is connected to the native question's field filter
    await filterWidget(page, {
      isEditing: true,
      name: matchingFilterType.name,
    }).click();

    const dashcard = getDashboardCard(page);
    await expect(
      dashcard.getByText("Column to filter on", { exact: true }),
    ).toBeVisible();
    await expect(
      dashcard.getByText("Native Filter", { exact: true }),
    ).toBeVisible();

    // Update the underlying question's query
    await mb.api.put(`/api/card/${cardId}`, {
      dataset_query: {
        type: "native",
        native: {
          query: "select 1",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
    });

    // Upon visiting the dashboard again the filter preserves its value
    await visitDashboard(page, mb.api, dashboardId);

    await expectSearch(page, "?text=Gadget");
    await expect(filterWidget(page, { name: "Gadget" })).toBeVisible();

    // But the question should display the new value and is not affected by the filter
    await expect(page.getByTestId("scalar-value")).toHaveText("1");

    // Confirm that it is not possible to connect filter to the updated question anymore (metabase#9299)
    await editDashboard(page);
    await filterWidget(page, {
      isEditing: true,
      name: matchingFilterType.name,
    }).click();
    await expect(
      page.getByText(
        /A text variable in this card can only be connected to a text filter with Is operator/,
      ),
    ).toBeVisible();
  });

  test("should handle multiple filters and allow multiple filter values without sending superfluous queries or limiting results (metabase#13150, metabase#15689, metabase#15695, metabase#16103, metabase#17139)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "13150 (Products)",
      query: { "source-table": PRODUCTS_ID },
    };

    const parameters = [
      {
        name: "Title",
        slug: "title",
        id: "9f20a0d5",
        type: "string/=",
        sectionId: "string",
      },
      {
        name: "Category",
        slug: "category",
        id: "719fe1c2",
        type: "string/=",
        sectionId: "string",
      },
      {
        name: "Vendor",
        slug: "vendor",
        id: "a73b7c9",
        type: "string/=",
        sectionId: "string",
      },
    ];

    const [titleFilter, categoryFilter, vendorFilter] = parameters;

    const { cardId, dashboardId, dashcardId } =
      await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails: { parameters },
      });

    // Connect all filters to the card
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        {
          id: dashcardId,
          card_id: cardId,
          row: 0,
          col: 0,
          size_x: 19,
          size_y: 12,
          parameter_mappings: [
            {
              parameter_id: titleFilter.id,
              card_id: cardId,
              target: ["dimension", ["field", PRODUCTS.TITLE, null]],
            },
            {
              parameter_id: categoryFilter.id,
              card_id: cardId,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
            {
              parameter_id: vendorFilter.id,
              card_id: cardId,
              target: ["dimension", ["field", PRODUCTS.VENDOR, null]],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    const cardQueries = countRequests(page, isDashcardQueryRequest);
    const categoryValuesPath = new RegExp(
      `^/api/dashboard/\\d+/params/${categoryFilter.id}/values$`,
    );
    const categoryValueFetches = countRequests(
      page,
      (method, pathname) =>
        method === "GET" && categoryValuesPath.test(pathname),
    );

    const firstCardQuery = page.waitForResponse((response) =>
      isDashcardQueryRequest(
        response.request().method(),
        new URL(response.url()).pathname,
      ),
    );
    await page.goto(
      `/dashboard/${dashboardId}?title=Awesome Concrete Shoes&category=Widget&vendor=McClure-Lockman`,
    );
    await firstCardQuery;

    // Multiple filters shouldn't affect the number of card query requests (metabase#13150)
    expect(cardQueries.count()).toBe(1);

    // Open category dropdown
    const valuesLoaded = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        categoryValuesPath.test(new URL(response.url()).pathname),
    );
    await filterWidget(page, { name: "Widget" }).click();
    await valuesLoaded;

    // Make sure all filters were fetched (should be cached after this)
    // Widget should be selected by default
    await expectFilterSelected(popover(page), "Widget", true);
    // Select one more filter (metabase#15689)
    await popover(page).getByText("Gizmo", { exact: true }).click();
    await expectFilterSelected(popover(page), "Gizmo", true);

    await expect(
      popover(page).getByText("Doohickey", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Gadget", { exact: true }),
    ).toBeVisible();

    expect(categoryValueFetches.count()).toBe(1);

    await popover(page).getByRole("button", { name: "Update filter" }).click();
    await page.getByText("2 selections", { exact: true }).click();

    // Even after we reopen the dropdown, it shouldn't send additional requests for values (metabase#16103)
    expect(categoryValueFetches.count()).toBe(1);

    // As a sanity check, make sure we can deselect the filter by clicking on it
    await popover(page).getByText("Gizmo", { exact: true }).click();
    await expectFilterSelected(popover(page), "Gizmo", false);

    await popover(page).getByRole("button", { name: "Update filter" }).click();
    await expect(page.getByText("2 selections", { exact: true })).toHaveCount(
      0,
    );
    await expect(filterWidget(page, { name: "Widget" })).toBeVisible();

    await filterWidget(page, { name: "Awesome Concrete Shoes" }).click();
    // Do not limit number of results (metabase#15695)
    // Prior to the issue being fixed, the cap was 100 results
    await popover(page)
      .getByPlaceholder("Search the list")
      .pressSequentially("Syner");
    await expect(
      popover(page).getByText("Synergistic Wool Coat", { exact: true }),
    ).toBeVisible();

    await expectSearch(
      page,
      "?category=Widget&title=Awesome+Concrete+Shoes&vendor=McClure-Lockman",
    );
    await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);

    // It should not reset previously defined filters when exiting 'edit' mode without making any changes (metabase#5332, metabase#17139)
    await editDashboard(page);
    await editBar(page).getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByText("You're editing this dashboard."),
    ).toHaveCount(0);

    await expectSearch(
      page,
      "?category=Widget&title=Awesome+Concrete+Shoes&vendor=McClure-Lockman",
    );
    await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
  });

  test.describe("when the user does not have self-service data permissions", () => {
    test.beforeEach(async ({ page, mb }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(page.getByTestId("table-header")).toBeVisible();

      await editDashboard(page);
      await setFilter(page, "ID");

      await selectDashboardFilter(getDashboardCard(page), "User ID");

      await saveDashboard(page);

      await mb.signIn("nodata");
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    });

    test("should not see mapping options", async ({ page }) => {
      await editDashboard(page);
      await filterWidget(page, { isEditing: true }).click();

      await expect(icon(page, "key")).toBeVisible();
    });
  });

  test.describe("when parameters are (dis)connected to dashcards", () => {
    let dashcardQueries: RequestCounter;

    test.beforeEach(async ({ page, mb }) => {
      const { id: dashboardId } = await createDashboard(mb.api, {
        name: "my dash",
      });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards,
      });
      await visitDashboard(page, mb.api, dashboardId);

      // create a disconnected filter + a default value
      await editDashboard(page);
      await setFilter(page, "Date picker", "Relative Date");

      await sidebar(page).locator(":text('Default value') + *").click();
      // Cypress .contains() takes the first match; the picker repeats
      // "Previous 7 days"-style labels across its shortcut columns.
      await popover(page)
        .getByText(/Previous 7 days/)
        .first()
        .click({ force: true });
      await saveDashboard(page);

      dashcardQueries = countRequests(page, isDashcardQueryRequest);
    });

    test("should not fetch dashcard data when filter is disconnected", async ({
      page,
    }) => {
      // Give any stray dashcard queries a beat to fire before asserting.
      await page.waitForTimeout(1000);
      expect(dashcardQueries.count()).toBe(0);
    });

    test("should fetch dashcard data after save when parameter is mapped", async ({
      page,
    }) => {
      // Connect filter to 2 cards
      await editDashboard(page);

      await editingDashboardParametersContainer(page)
        .getByText("Date", { exact: true })
        .click();

      await selectDashboardFilter(getDashboardCard(page, 0), "Created At");
      await selectDashboardFilter(getDashboardCard(page, 1), "Created At");

      await saveDashboard(page);

      await expect.poll(() => dashcardQueries.count()).toBe(2);
    });

    test("should fetch dashcard data when parameter mapping is removed", async ({
      page,
    }) => {
      // Connect filter to 1 card only
      await editDashboard(page);
      await editingDashboardParametersContainer(page)
        .getByText("Date", { exact: true })
        .click();
      await selectDashboardFilter(getDashboardCard(page, 0), "Created At");

      await saveDashboard(page);

      await expect.poll(() => dashcardQueries.count()).toBe(1);

      // Disconnect filter from the 1st card
      await editDashboard(page);

      await editingDashboardParametersContainer(page)
        .getByText("Date", { exact: true })
        .click();

      await disconnectDashboardFilter(getDashboardCard(page, 0));
      await saveDashboard(page);

      await expect.poll(() => dashcardQueries.count()).toBe(2);
    });

    test("should not fetch dashcard data when nothing changed on save", async ({
      page,
    }) => {
      await editDashboard(page);
      await saveDashboardWithoutAwaitingRequests(page);

      await page.waitForTimeout(1000);
      expect(dashcardQueries.count()).toBe(0);
    });
  });

  test.describe("preserve last used value", () => {
    let dashboardId: number;

    test.beforeEach(async ({ page, mb }) => {
      const textFilter = mockParameter({
        name: "Text",
        slug: "string",
        id: "5aefc726",
        type: "string/=",
        sectionId: "string",
      });

      const peopleQuestionDetails = {
        query: { "source-table": PEOPLE_ID, limit: 5 },
      };

      const { dashboard, questions } = await createDashboardWithQuestions(
        mb.api,
        {
          dashboardDetails: { parameters: [textFilter] },
          questions: [peopleQuestionDetails],
        },
      );
      const [peopleCard] = questions;

      await updateDashboardCards(mb.api, {
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: peopleCard.id,
            parameter_mappings: [
              {
                parameter_id: textFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.NAME, null]],
              },
            ],
          },
        ],
      });

      dashboardId = dashboard.id;
      await visitDashboard(page, mb.api, dashboardId);
    });

    test("should retain the last used value for a dashboard filter", async ({
      page,
      mb,
    }) => {
      await filterWidget(page).click();

      const paramPopover = dashboardParametersPopover(page);
      await fieldValuesCombobox(paramPopover).pressSequentially(
        "Antwan Fisher",
      );
      await paramPopover.getByRole("button", { name: "Add filter" }).click();

      await expect(
        getDashboardCard(page).getByText("7750 Michalik Lane", { exact: true }),
      ).toBeVisible();

      const pinnedItems = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          response.url().includes("/items?pinned_state"),
      );
      await page.goto("/collection/root");
      await pinnedItems;

      await visitDashboard(page, mb.api, dashboardId);

      await expect(filterWidget(page).getByRole("listitem")).toHaveText(
        /^Text: Antwan Fisher$/,
      );

      // verify filter resetting works
      await clearFilterWidget(page);
      await expect(
        getDashboardCard(page).getByText("761 Fish Hill Road", { exact: true }),
      ).toBeVisible();
    });

    test("should allow resetting last used value", async ({ page, mb }) => {
      await filterWidget(page).click();

      const paramPopover = dashboardParametersPopover(page);
      await fieldValuesCombobox(paramPopover).pressSequentially(
        "Antwan Fisher",
      );
      await paramPopover.getByRole("button", { name: "Add filter" }).click();

      await expect(
        getDashboardCard(page).getByText("7750 Michalik Lane", { exact: true }),
      ).toBeVisible();

      // reset filter values from url by visiting dashboard by id
      await visitDashboard(page, mb.api, dashboardId);

      await clearFilterWidget(page);

      await expect(
        getDashboardCard(page).getByText("761 Fish Hill Road", { exact: true }),
      ).toBeVisible();

      // verify filter value is not specified after reload
      await visitDashboard(page, mb.api, dashboardId);

      await expect(
        getDashboardCard(page).getByText("761 Fish Hill Road", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("parameters in heading dashcards", () => {
    const categoryParameter = mockParameter({
      id: "1b9cd9f1",
      name: "Category",
      type: "string/=",
      slug: "category",
      sectionId: "string",
    });

    const countParameter = mockParameter({
      id: "88a1257c",
      name: "Count",
      type: "number/<=",
      slug: "count",
      sectionId: "number",
    });

    const categoryFieldRef = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    const categoryMapping = (cardId: number) => ({
      parameter_id: categoryParameter.id,
      card_id: cardId,
      target: ["dimension", categoryFieldRef, { "stage-number": 0 }],
    });

    const ordersCountByCategory = {
      display: "bar",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [categoryFieldRef],
      },
    };

    test("should be able to add and use filters", async ({ page, mb }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api, {
        questionDetails: ordersCountByCategory,
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await addHeadingWhileEditing(page, "Heading");
      await setDashCardFilter(page, 1, "Text or Category", null, "Category");
      await selectDashboardFilter(getDashboardCard(page, 0), "Category");
      // Ensure filters are not draggable
      await expect(icon(getDashboardCard(page, 0), "grabber")).toHaveCount(0);
      await saveDashboard(page);

      // Verify the filter doesn't appear in the dashboard header
      await expect(dashboardParametersContainer(page)).toHaveCount(0);

      // Verify filtering works
      await filterWidget(getDashboardCard(page, 1), {
        name: "Category",
      }).click();
      await dashboardParametersPopover(page)
        .getByLabel("Gadget", { exact: true })
        .click();
      await dashboardParametersPopover(page)
        .getByRole("button", { name: "Add filter" })
        .click();

      const card0 = getDashboardCard(page, 0);
      await expect(card0.getByText("Gadget", { exact: true })).toBeVisible();
      await expect(card0.getByText("Doohickey", { exact: true })).toHaveCount(
        0,
      );
      await expect(card0.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Widget", { exact: true })).toHaveCount(0);

      await expectSearch(page, "?category=Gadget");

      // Add a second filter
      await editDashboard(page);
      await setDashCardFilter(page, 1, "Number", null, "Count");
      await selectDashboardFilter(getDashboardCard(page, 0), "Count");
      await saveDashboard(page);

      // Verify the filter doesn't appear in the dashboard header
      await expect(dashboardParametersContainer(page)).toHaveCount(0);

      // Verify filtering works
      const card1 = getDashboardCard(page, 1);
      await expect(filterWidget(card1, { name: "Category" })).toBeVisible();
      await filterWidget(card1, { name: "Count" }).click();
      await dashboardParametersPopover(page)
        .getByPlaceholder("Enter a number")
        .fill("6000");
      await dashboardParametersPopover(page)
        .getByRole("button", { name: "Add filter" })
        .click();

      await expect(card0.getByText(/No results/)).toBeVisible();

      await expectSearch(page, "?category=Gadget&count=6000");

      await clearFilterWidget(card1, 1);

      await expect(card0.getByText("Gadget", { exact: true })).toBeVisible();
      await expect(card0.getByText("Doohickey", { exact: true })).toHaveCount(
        0,
      );
      await expect(card0.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Widget", { exact: true })).toHaveCount(0);

      await expectSearch(page, "?category=Gadget&count=");
    });

    test("should be able to edit filters", async ({ page, mb }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryParameter] },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          mockHeadingDashboardCard({
            inline_parameters: [categoryParameter.id],
            size_x: 24,
            size_y: 1,
          }),
          {
            id: dashcardId,
            row: 1,
            size_x: 12,
            size_y: 6,
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();

      await setDashboardParameterName(page, "Count");
      await setDashboardParameterType(page, "Number");
      await setDashboardParameterOperator(page, "Less than or equal to");

      // Set default value
      await dashboardParameterSidebar(page).getByLabel("Default value").click();
      await popover(page).getByPlaceholder("Enter a number").fill("4000");
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      // Connect to the card
      await selectDashboardFilter(getDashboardCard(page, 1), "Count");

      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();
      await saveDashboard(page);

      const card0 = getDashboardCard(page, 0);
      // substring match so that it matches "Count " (with a non-breaking space)
      await expect(filterWidget(card0).getByText("Count")).toBeVisible();
      await expect(filterWidget(card0).getByText("4,000")).toBeVisible();
      await expect(card0.getByText("Category", { exact: true })).toHaveCount(0);

      const card1 = getDashboardCard(page, 1);
      await expect(card1.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(card1.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(card1.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(card1.getByText("Widget", { exact: true })).toHaveCount(0);

      await expectSearch(page, "?count=4000");
    });

    test("should remove filters correctly", async ({ page, mb }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [categoryParameter, countParameter],
          },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          mockHeadingDashboardCard({
            inline_parameters: [categoryParameter.id, countParameter.id],
            size_x: 24,
            size_y: 1,
          }),
          {
            id: dashcardId,
            row: 1,
            size_x: 12,
            size_y: 6,
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);

      const card0 = getDashboardCard(page, 0);
      await expect(filterWidget(card0, { name: "Category" })).toBeVisible();
      // Verify we're hiding filters that are not linked to any cards
      await expect(card0.getByText("Count", { exact: true })).toHaveCount(0);

      await editDashboard(page);

      await filterWidget(card0, { isEditing: true, name: "Count" }).click();
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Remove" })
        .click();

      await expect(await inputWithValue(card0, "Heading Text")).toBeVisible();
      await expect(card0.getByText("Count", { exact: true })).toHaveCount(0);

      await filterWidget(card0, { isEditing: true, name: "Category" }).click();
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Remove" })
        .click();

      const updateDashboard = waitForDashboardPut(page);
      await saveDashboard(page);
      // Payload shape assertion — the PUT body is this test's real subject.
      const payload = (await updateDashboard)
        .request()
        .postDataJSON() as DashboardPutPayload;
      expect(payload.parameters).toHaveLength(0);
      for (const dashcard of payload.dashcards) {
        expect(dashcard.inline_parameters).toHaveLength(0);
        expect(dashcard.parameter_mappings).toHaveLength(0);
      }

      await expect(
        card0.getByText("Heading Text", { exact: true }),
      ).toBeVisible();
      await expect(card0.getByText("Count", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Category", { exact: true })).toHaveCount(0);
    });

    test("should remove filters when removing a dashcard", async ({
      page,
      mb,
    }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryParameter] },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          mockHeadingDashboardCard({
            inline_parameters: [categoryParameter.id],
            size_x: 24,
            size_y: 1,
          }),
          {
            id: dashcardId,
            row: 1,
            size_x: 12,
            size_y: 6,
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await expect(
        getDashboardCard(page, 0).getByText("Heading Text"),
      ).toBeVisible();
      await removeDashboardCard(page, 0);

      const updateDashboard = waitForDashboardPut(page);
      await saveDashboard(page);

      const payload = (await updateDashboard)
        .request()
        .postDataJSON() as DashboardPutPayload;
      expect(payload.parameters).toHaveLength(0);
      for (const dashcard of payload.dashcards) {
        expect(dashcard.inline_parameters).toHaveLength(0);
        expect(dashcard.parameter_mappings).toHaveLength(0);
      }
    });

    test("should not use inline filters for auto-wiring", async ({
      page,
      mb,
    }) => {
      await mb.api.createQuestion({
        name: "Average total by category",
        display: "bar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
          breakout: [categoryFieldRef],
        },
      });

      const { dashboardId, dashcardId } = await createQuestionAndDashboard(
        mb.api,
        {
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [categoryParameter, countParameter],
          },
        },
      );
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          mockHeadingDashboardCard({
            inline_parameters: [categoryParameter.id, countParameter.id],
            size_x: 24,
            size_y: 1,
          }),
          { id: dashcardId, row: 1, size_x: 12, size_y: 6 },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      // Connect Category filter to first card
      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();
      await selectDashboardFilter(getDashboardCard(page, 1), "Category");
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      // Add the second card with category dimension
      await openQuestionsSidebar(page);
      await sidebar(page)
        .getByText("Average total by category", { exact: true })
        .click();
      await expect(
        getDashboardCard(page, 2).getByText("Average of Total", {
          exact: true,
        }),
      ).toBeVisible();

      // Verify filter isn't auto-wired and there's no auto-wiring toast
      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();
      await expect(
        getDashboardCard(page, 2)
          .getByTestId("parameter-mapper-container")
          .getByText(/Category/),
      ).toHaveCount(0);
      await expect(undoToast(page)).toHaveCount(0);

      // Verify filter isn't auto-wired after mapping it to a card
      await disconnectDashboardFilter(getDashboardCard(page, 1));
      await selectDashboardFilter(getDashboardCard(page, 1), "Category");
      await expect(
        getDashboardCard(page, 2)
          .getByTestId("parameter-mapper-container")
          .getByText(/Category/),
      ).toHaveCount(0);
      await expect(undoToast(page)).toHaveCount(0);
    });

    test("should duplicate filters when duplicating a dashcard", async ({
      page,
      mb,
    }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryParameter] },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          mockHeadingDashboardCard({
            inline_parameters: [categoryParameter.id],
            size_x: 24,
            size_y: 1,
          }),
          {
            id: dashcardId,
            row: 1,
            size_x: 12,
            size_y: 6,
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await getDashboardCard(page, 0).hover();
      await getDashboardCard(page, 0).getByLabel("Duplicate").click();

      const card2 = getDashboardCard(page, 2);
      await expect(await inputWithValue(card2, "Heading Text")).toBeVisible();
      await filterWidget(card2, { isEditing: true, name: "Category 1" }).click();

      // Ensure the filter isn't mapped to the question by default
      await expect(
        getDashboardCard(page, 1)
          .getByTestId("parameter-mapper-container")
          .getByText(/Category/),
      ).toHaveCount(0);

      // Connect the filter to the question
      await selectDashboardFilter(getDashboardCard(page, 1), "Category");

      const updateDashboard = waitForDashboardPut(page);
      await saveDashboard(page);
      const payload = (await updateDashboard)
        .request()
        .postDataJSON() as DashboardPutPayload;
      expect(payload.parameters).toHaveLength(2);

      // Ensure filters work independently
      await filterWidget(getDashboardCard(page, 0), {
        name: "Category",
      }).click();
      await popover(page).getByText("Doohickey", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      const card1 = getDashboardCard(page, 1);
      await expect(card1.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(card1.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expectSearch(page, "?category=Doohickey&category_1=");

      await filterWidget(card2, { name: "Category 1" }).click();
      await popover(page).getByText("Gizmo", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expect(card1.getByText(/No results/)).toBeVisible();
      await expectSearch(page, "?category=Doohickey&category_1=Gizmo");

      await clearFilterWidget(getDashboardCard(page, 0));

      await expect(card1.getByText("Doohickey", { exact: true })).toHaveCount(
        0,
      );
      await expect(card1.getByText("Gizmo", { exact: true })).toBeVisible();
      await expectSearch(page, "?category=&category_1=Gizmo");
    });

    test("should duplicate filters when duplicating a dashboard", async ({
      page,
      mb,
    }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryParameter] },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          mockHeadingDashboardCard({
            inline_parameters: [categoryParameter.id],
            size_x: 24,
            size_y: 1,
          }),
          {
            id: dashcardId,
            row: 1,
            size_x: 12,
            size_y: 6,
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboardId);

      await openDashboardMenu(page, "Duplicate");
      await modal(page).getByRole("button", { name: "Duplicate" }).click();
      await expect(
        dashboardHeader(page).getByText("Test Dashboard - Duplicate", {
          exact: true,
        }),
      ).toBeVisible();

      const card1 = getDashboardCard(page, 1);
      await expect(card1.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(card1.getByText("Gizmo", { exact: true })).toBeVisible();
      await expect(card1.getByText("Gadget", { exact: true })).toBeVisible();
      await expect(card1.getByText("Widget", { exact: true })).toBeVisible();

      await filterWidget(getDashboardCard(page, 0), {
        name: "Category",
      }).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expect(card1.getByText("Gadget", { exact: true })).toBeVisible();
      await expect(card1.getByText("Doohickey", { exact: true })).toHaveCount(
        0,
      );
      await expect(card1.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(card1.getByText("Widget", { exact: true })).toHaveCount(0);

      await expectSearch(page, "?category=Gadget");
    });

    test("should correctly undo dashcard removal (VIZ-1236)", async ({
      page,
      mb,
    }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryParameter] },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          mockHeadingDashboardCard({
            inline_parameters: [categoryParameter.id],
            size_x: 24,
            size_y: 1,
          }),
          {
            id: dashcardId,
            row: 1,
            size_x: 12,
            size_y: 6,
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await removeDashboardCard(page, 0);
      await expect(
        getDashboardCard(page).getByText("test question", { exact: true }),
      ).toBeVisible();

      await undo(page);

      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();
      await expect(
        getDashboardCard(page, 1)
          .getByTestId("parameter-mapper-container")
          .getByText(/Category/),
      ).toBeVisible();
    });

    test("should not display a parameter widget if there are no linked with it cards after a text card variable is removed (UXW-751)", async ({
      page,
      mb,
    }) => {
      const dashboard = await createDashboard(mb.api, {
        parameters: [categoryParameter, countParameter],
      });
      const virtualCard = mockVirtualCard({ display: "text" });

      await updateDashboardCards(mb.api, {
        dashboard_id: dashboard.id,
        cards: [
          mockTextDashboardCard({
            card: virtualCard,
            text: "Value {{VAR1}} and {{VAR2}}",
            size_x: 3,
            size_y: 3,
            parameter_mappings: [
              {
                parameter_id: categoryParameter.id,
                card_id: virtualCard.id,
                target: ["text-tag", "VAR1"],
              },
              {
                parameter_id: countParameter.id,
                card_id: virtualCard.id,
                target: ["text-tag", "VAR2"],
              },
            ],
          }),
        ],
      });
      await visitDashboard(page, mb.api, dashboard.id);

      await expect(filterWidget(page, { name: "Category" })).toBeVisible();

      await editDashboard(page);

      await getDashboardCard(page, 0).click();
      await getDashboardCard(page, 0)
        .locator("textarea")
        .fill("Value {{VAR1}}");

      await saveDashboard(page);

      await expect(filterWidget(page, { name: "Category" })).toBeVisible();
      await expect(
        page.getByTestId("parameter-widget").getByText("Count"),
      ).toHaveCount(0);

      await editDashboard(page);

      await getDashboardCard(page, 0).click();
      await getDashboardCard(page, 0).locator("textarea").fill("Value null");

      await saveDashboard(page);

      await expect(page.getByTestId("parameter-widget")).toHaveCount(0);
    });

    test("should work correctly in public dashboards", async ({
      page,
      mb,
    }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [categoryParameter, countParameter],
          },
        });

      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          mockHeadingDashboardCard({
            inline_parameters: [categoryParameter.id],
            size_x: 24,
            size_y: 1,
          }),
          {
            id: dashcardId,
            row: 1,
            size_x: 24,
            size_y: 6,
            inline_parameters: [countParameter.id],
            parameter_mappings: [
              categoryMapping(cardId),
              {
                parameter_id: countParameter.id,
                card_id: ORDERS_BY_YEAR_QUESTION_ID,
                target: [
                  "dimension",
                  ["field", "count", { "base-type": "type/Integer" }],
                  { "stage-number": 1 },
                ],
              },
            ],
          },
        ],
      });

      await visitPublicDashboard(page, mb, dashboardId);

      const card1 = getDashboardCard(page, 1);
      await expect(card1.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(card1.getByText("Gizmo", { exact: true })).toBeVisible();
      await expect(card1.getByText("Gadget", { exact: true })).toBeVisible();
      await expect(card1.getByText("Widget", { exact: true })).toBeVisible();

      await filterWidget(getDashboardCard(page, 0), {
        name: "Category",
      }).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expect(card1.getByText("Gadget", { exact: true })).toBeVisible();
      await expect(card1.getByText("Doohickey", { exact: true })).toHaveCount(
        0,
      );
      await expect(card1.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(card1.getByText("Widget", { exact: true })).toHaveCount(0);

      await expectSearch(page, "?category=Gadget&count=");

      // Verify filter doesn't show up in the dashboard header
      await expect(dashboardParametersContainer(page)).toHaveCount(0);

      expect(
        await isScrollableHorizontally(page.getByTestId("embed-frame")),
      ).toBe(false);
    });

    for (const { movedCardType, dashcardIndex } of [
      { movedCardType: "heading", dashcardIndex: 0 },
      { movedCardType: "question", dashcardIndex: 1 },
    ]) {
      test(`should correctly unwire inline parameters when moving a ${movedCardType} card to another tab`, async ({
        page,
        mb,
      }) => {
        const TAB_1 = { id: 1, name: "Tab 1" };
        const TAB_2 = { id: 2, name: "Tab 2" };

        const dashboard = await createDashboardWithTabs(mb.api, {
          parameters: [categoryParameter, countParameter],
          tabs: [TAB_1, TAB_2],
          dashcards: [
            mockHeadingDashboardCard({
              id: -1,
              dashboard_tab_id: TAB_1.id,
              inline_parameters: [countParameter.id],
              size_x: 24,
              size_y: 1,
            }),
            mockQuestionDashboardCard({
              id: -2,
              card_id: ORDERS_BY_YEAR_QUESTION_ID,
              dashboard_tab_id: TAB_1.id,
              parameter_mappings: [
                {
                  parameter_id: countParameter.id,
                  card_id: ORDERS_BY_YEAR_QUESTION_ID,
                  target: [
                    "dimension",
                    ["field", "count", { "base-type": "type/Integer" }],
                    { "stage-number": 1 },
                  ],
                },
                categoryMapping(ORDERS_BY_YEAR_QUESTION_ID),
              ],
              row: 1,
              size_x: 12,
              size_y: 6,
            }),
          ],
        });
        await visitDashboard(page, mb.api, dashboard.id);
        await editDashboard(page);

        await moveDashCardToTab(page, { dashcardIndex, tabName: TAB_2.name });

        const updateDashboard = waitForDashboardPut(page);
        await saveDashboard(page);

        const payload = (await updateDashboard)
          .request()
          .postDataJSON() as DashboardPutPayload;
        const questionDashcard = payload.dashcards.find(
          (dashcard) => !!dashcard.card_id,
        );
        expect(questionDashcard).toBeDefined();

        // Ensure inline parameter is unwired, but not the header one
        expect(questionDashcard?.parameter_mappings).toHaveLength(1);
        expect(questionDashcard?.parameter_mappings[0].parameter_id).toBe(
          categoryParameter.id,
        );
      });
    }

    test.describe("embedded dashboards", () => {
      test("should work correctly when parameter is enabled", async ({
        page,
        mb,
      }) => {
        const { cardId, dashboardId, dashcardId } =
          await createQuestionAndDashboard(mb.api, {
            questionDetails: ordersCountByCategory,
            dashboardDetails: {
              parameters: [categoryParameter],
              enable_embedding: true,
              embedding_params: {
                [categoryParameter.slug]: "enabled",
              },
            },
          });

        await updateDashboardCards(mb.api, {
          dashboard_id: dashboardId,
          cards: [
            mockHeadingDashboardCard({
              inline_parameters: [categoryParameter.id],
              size_x: 24,
              size_y: 1,
            }),
            {
              id: dashcardId,
              row: 1,
              size_x: 12,
              size_y: 6,
              parameter_mappings: [categoryMapping(cardId)],
            },
          ],
        });

        await visitEmbeddedPage(page, mb, {
          resource: { dashboard: dashboardId },
          params: {},
        });

        const card1 = getDashboardCard(page, 1);
        await expect(
          card1.getByText("Doohickey", { exact: true }),
        ).toBeVisible();
        await expect(card1.getByText("Gizmo", { exact: true })).toBeVisible();
        await expect(card1.getByText("Gadget", { exact: true })).toBeVisible();
        await expect(card1.getByText("Widget", { exact: true })).toBeVisible();

        await filterWidget(getDashboardCard(page, 0), {
          name: "Category",
        }).click();
        await popover(page).getByText("Gadget", { exact: true }).click();
        await popover(page).getByRole("button", { name: "Add filter" }).click();

        await expect(card1.getByText("Gadget", { exact: true })).toBeVisible();
        await expect(
          card1.getByText("Doohickey", { exact: true }),
        ).toHaveCount(0);
        await expect(card1.getByText("Gizmo", { exact: true })).toHaveCount(0);
        await expect(card1.getByText("Widget", { exact: true })).toHaveCount(0);

        await expectSearch(page, "?category=Gadget");

        // Verify filter doesn't show up in the dashboard header
        await expect(dashboardParametersContainer(page)).toHaveCount(0);
      });

      test("should work correctly when parameter is disabled", async ({
        page,
        mb,
      }) => {
        const { cardId, dashboardId, dashcardId } =
          await createQuestionAndDashboard(mb.api, {
            questionDetails: ordersCountByCategory,
            dashboardDetails: {
              parameters: [categoryParameter],
              enable_embedding: true,
              embedding_params: {
                [categoryParameter.slug]: "disabled",
              },
            },
          });

        await updateDashboardCards(mb.api, {
          dashboard_id: dashboardId,
          cards: [
            mockHeadingDashboardCard({
              inline_parameters: [categoryParameter.id],
              size_x: 24,
              size_y: 1,
            }),
            {
              id: dashcardId,
              row: 1,
              size_x: 12,
              size_y: 6,
              parameter_mappings: [categoryMapping(cardId)],
            },
          ],
        });

        await visitEmbeddedPage(page, mb, {
          resource: { dashboard: dashboardId },
          params: {},
        });

        const card0 = getDashboardCard(page, 0);
        await expect(
          card0.getByText("Heading Text", { exact: true }),
        ).toBeVisible();
        await expect(card0.getByText("Category", { exact: true })).toHaveCount(
          0,
        );
      });

      test("should work correctly when parameter is locked", async ({
        page,
        mb,
      }) => {
        const { cardId, dashboardId, dashcardId } =
          await createQuestionAndDashboard(mb.api, {
            questionDetails: ordersCountByCategory,
            dashboardDetails: {
              parameters: [categoryParameter],
              enable_embedding: true,
              embedding_params: {
                [categoryParameter.slug]: "locked",
              },
            },
          });

        await updateDashboardCards(mb.api, {
          dashboard_id: dashboardId,
          cards: [
            mockHeadingDashboardCard({
              inline_parameters: [categoryParameter.id],
              size_x: 24,
              size_y: 1,
            }),
            {
              id: dashcardId,
              row: 1,
              size_x: 12,
              size_y: 6,
              parameter_mappings: [categoryMapping(cardId)],
            },
          ],
        });

        await visitEmbeddedPage(page, mb, {
          resource: { dashboard: dashboardId },
          params: {
            [categoryParameter.slug]: ["Gadget", "Widget"],
          },
        });

        const card0 = getDashboardCard(page, 0);
        await expect(
          card0.getByText("Heading Text", { exact: true }),
        ).toBeVisible();
        await expect(card0.getByText("Category", { exact: true })).toHaveCount(
          0,
        );

        const card1 = getDashboardCard(page, 1);
        await expect(card1.getByText("Gadget", { exact: true })).toBeVisible();
        await expect(card1.getByText("Widget", { exact: true })).toBeVisible();
        await expect(
          card1.getByText("Doohickey", { exact: true }),
        ).toHaveCount(0);
        await expect(card1.getByText("Gizmo", { exact: true })).toHaveCount(0);
      });
    });
  });

  test.describe("parameters in question dashcards", () => {
    const categoryParameter = mockParameter({
      id: "1b9cd9f1",
      name: "Category",
      type: "string/=",
      slug: "category",
      sectionId: "string",
    });

    const countParameter = mockParameter({
      id: "88a1257c",
      name: "Count",
      type: "number/<=",
      slug: "count",
      sectionId: "number",
    });

    const categoryFieldRef = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    const categoryMapping = (cardId: number) => ({
      parameter_id: categoryParameter.id,
      card_id: cardId,
      target: ["dimension", categoryFieldRef, { "stage-number": 0 }],
    });

    const ordersCountByCategory = {
      display: "bar",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [categoryFieldRef],
      },
    };

    test("should be able to add and use filters", async ({ page, mb }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api, {
        questionDetails: ordersCountByCategory,
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await setDashCardFilter(page, 0, "Text or Category", null, "Category");
      await selectDashboardFilter(getDashboardCard(page, 0), "Category");
      await saveDashboard(page);

      // Verify the filter doesn't appear in the dashboard header
      await expect(dashboardParametersContainer(page)).toHaveCount(0);

      // Verify filtering works
      const card0 = getDashboardCard(page, 0);
      // wait for query
      await expect(card0.getByText("Gadget", { exact: true })).toBeVisible();
      await filterWidget(card0, { name: "Category" }).click();

      await expect(
        dashboardParametersPopover(page).getByLabel("Gadget", { exact: true }),
      ).toBeVisible();
      await dashboardParametersPopover(page)
        .getByLabel("Gadget", { exact: true })
        .click();
      await dashboardParametersPopover(page)
        .getByRole("button", { name: "Add filter" })
        .click();

      // x-axis label + filter
      await expect(
        card0.getByText("Gadget", { exact: true }).filter({ visible: true }),
      ).toHaveCount(2);
      await expect(card0.getByText("Doohickey", { exact: true })).toHaveCount(
        0,
      );
      await expect(card0.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Widget", { exact: true })).toHaveCount(0);

      await expectSearch(page, "?category=Gadget");
    });

    test("should prefer more granular filter", async ({ page, mb }) => {
      const headerCategoryParameter = mockParameter({
        ...categoryParameter,
        id: "header-category",
        name: "Header Category",
        slug: "header-category",
      });

      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [headerCategoryParameter, categoryParameter],
          },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          {
            id: dashcardId,
            inline_parameters: [categoryParameter.id],
            parameter_mappings: [
              categoryMapping(cardId),
              {
                parameter_id: headerCategoryParameter.id,
                card_id: cardId,
                target: ["dimension", categoryFieldRef, { "stage-number": 0 }],
              },
            ],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);

      const card0 = getDashboardCard(page, 0);
      await expect(card0.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(card0.getByText("Gizmo", { exact: true })).toBeVisible();
      await expect(card0.getByText("Gadget", { exact: true })).toBeVisible();
      await expect(card0.getByText("Widget", { exact: true })).toBeVisible();

      // Update header filter (Doohickey + Gizmo)
      await dashboardParametersContainer(page)
        .getByText("Header Category", { exact: true })
        .click();
      await popover(page).getByLabel("Doohickey", { exact: true }).click();
      await popover(page).getByLabel("Gizmo", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await expect(card0.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(card0.getByText("Gizmo", { exact: true })).toBeVisible();
      await expect(card0.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Widget", { exact: true })).toHaveCount(0);

      // Update card filter (Gadget) and verify no results
      await filterWidget(card0, { name: "Category" }).click();
      await popover(page).getByLabel("Gadget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await expect(card0.getByText(/No results/)).toBeVisible();

      // Update card filter (Gizmo) and verify 1 result
      await filterWidget(card0).click();
      await popover(page).getByLabel("Gadget", { exact: true }).click(); // unselect
      await popover(page).getByLabel("Gizmo", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter" })
        .click();
      await expect(
        card0
          .getByText("Gizmo", { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await expect(card0.getByText("Doohickey", { exact: true })).toHaveCount(
        0,
      );
      await expect(card0.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Widget", { exact: true })).toHaveCount(0);

      // Update header filter, verify no changes
      await filterWidget(dashboardParametersContainer(page)).click();
      await popover(page).getByLabel("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter" })
        .click();
      await expect(
        dashboardParametersContainer(page).getByText("3 selections", {
          exact: true,
        }),
      ).toBeVisible();
      // x-axis label + filter
      await expect(
        card0.getByText("Gizmo", { exact: true }).filter({ visible: true }),
      ).toHaveCount(2);
      await expect(card0.getByText("Doohickey", { exact: true })).toHaveCount(
        0,
      );
      await expect(card0.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Widget", { exact: true })).toHaveCount(0);
    });

    test("should be able to edit filters", async ({ page, mb }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryParameter] },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          {
            id: dashcardId,
            inline_parameters: [categoryParameter.id],
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();

      await setDashboardParameterName(page, "Count");
      await setDashboardParameterType(page, "Number");
      await setDashboardParameterOperator(page, "Less than or equal to");

      // Set default value
      await dashboardParameterSidebar(page).getByLabel("Default value").click();
      await popover(page).getByPlaceholder("Enter a number").fill("4000");
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      // Connect to the card
      await selectDashboardFilter(getDashboardCard(page, 0), "Count");

      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();
      await saveDashboard(page);

      const card0 = getDashboardCard(page, 0);
      // Playwright's whitespace normalization makes the widget's
      // "Count " also match exact "Count" (alongside the y-axis
      // label), so assert on the first match instead of a single one.
      await expect(
        card0.getByText("Count", { exact: true }).first(),
      ).toBeVisible();
      // y-axis label + filter
      await expect(
        card0.getByText("4,000", { exact: true }).filter({ visible: true }),
      ).toHaveCount(2);
      await expect(card0.getByText("Category", { exact: true })).toHaveCount(0);

      await expect(card0.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(card0.getByText("Gizmo", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Gadget", { exact: true })).toHaveCount(0);
      await expect(card0.getByText("Widget", { exact: true })).toHaveCount(0);

      await expectSearch(page, "?count=4000");
    });

    test("should remove filters correctly", async ({ page, mb }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [categoryParameter, countParameter],
          },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          {
            id: dashcardId,
            size_x: 18,
            inline_parameters: [categoryParameter.id, countParameter.id],
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);

      const card0 = getDashboardCard(page, 0);
      await expect(filterWidget(card0, { name: "Category" })).toBeVisible();
      // Verify we're hiding filters that are not linked to any cards.
      // (Deviation from the Cypress original — see the spec header.)
      await expect(filterWidget(card0, { name: "Count" })).toHaveCount(0);

      await editDashboard(page);

      await filterWidget(card0, { isEditing: true, name: "Count" }).click();
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Remove" })
        .click();

      await expect(
        filterWidget(card0, { isEditing: true, name: "Count" }),
      ).toHaveCount(0);
      await filterWidget(card0, { isEditing: true, name: "Category" }).click();

      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Remove" })
        .click();

      const updateDashboard = waitForDashboardPut(page);
      await saveDashboard(page);
      const payload = (await updateDashboard)
        .request()
        .postDataJSON() as DashboardPutPayload;
      expect(payload.parameters).toHaveLength(0);
      for (const dashcard of payload.dashcards) {
        expect(dashcard.inline_parameters).toHaveLength(0);
        expect(dashcard.parameter_mappings).toHaveLength(0);
      }

      await expect(card0.getByText("Category", { exact: true })).toHaveCount(0);
      // y-axis label only
      await expect(card0.getByText("Count", { exact: true })).toHaveCount(1);
    });

    test("should remove filters when removing a dashcard", async ({
      page,
      mb,
    }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryParameter] },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          {
            id: dashcardId,
            inline_parameters: [categoryParameter.id],
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await expect(
        getDashboardCard(page, 0).getByText("Doohickey", { exact: true }),
      ).toBeVisible();
      await removeDashboardCard(page, 0);

      const updateDashboard = waitForDashboardPut(page);
      await saveDashboard(page);

      const payload = (await updateDashboard)
        .request()
        .postDataJSON() as DashboardPutPayload;
      expect(payload.parameters).toHaveLength(0);
      for (const dashcard of payload.dashcards) {
        expect(dashcard.inline_parameters).toHaveLength(0);
        expect(dashcard.parameter_mappings).toHaveLength(0);
      }
    });

    test("should not use inline filters for auto-wiring", async ({
      page,
      mb,
    }) => {
      await mb.api.createQuestion({
        name: "Average total by category",
        display: "bar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
          breakout: [categoryFieldRef],
        },
      });

      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [categoryParameter, countParameter],
          },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          {
            id: dashcardId,
            inline_parameters: [categoryParameter.id, countParameter.id],
            size_x: 24,
            size_y: 4,
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      // Add a second card with category dimension
      await openQuestionsSidebar(page);
      await sidebar(page)
        .getByText("Average total by category", { exact: true })
        .click();
      await expect(
        getDashboardCard(page, 1).getByText("Average of Total", {
          exact: true,
        }),
      ).toBeVisible();

      // Verify filter isn't auto-wired and there's no auto-wiring toast
      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();
      await expect(
        getDashboardCard(page, 1)
          .getByTestId("parameter-mapper-container")
          .getByText(/Category/),
      ).toHaveCount(0);
      await expect(undoToast(page)).toHaveCount(0);

      // Verify filter isn't auto-wired after mapping it to a card
      await getDashboardCard(page, 0).click(); // click to stop dragging a card
      await disconnectDashboardFilter(getDashboardCard(page, 0));
      await selectDashboardFilter(getDashboardCard(page, 0), "Category");
      await expect(
        getDashboardCard(page, 1)
          .getByTestId("parameter-mapper-container")
          .getByText(/Category/),
      ).toHaveCount(0);
      await expect(undoToast(page)).toHaveCount(0);
    });

    test("should duplicate filters and mappings when duplicating a dashcard", async ({
      page,
      mb,
    }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            auto_apply_filters: false,
            parameters: [categoryParameter, countParameter],
          },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          {
            id: dashcardId,
            inline_parameters: [categoryParameter.id],
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      // Wait for the dashcard to finish rendering before editing
      await expect(
        getDashboardCard(page, 0).getByTestId("chart-container"),
      ).toBeVisible();

      // Connect the Count filter in the header to first card
      await editingDashboardParametersContainer(page)
        .getByText("Count", { exact: true })
        .click();
      await selectDashboardFilter(getDashboardCard(page, 0), "Count");
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      await getDashboardCard(page, 0).hover();
      await getDashboardCard(page, 0).getByLabel("Duplicate").click();

      const card1 = getDashboardCard(page, 1);
      await expect(card1.getByTestId("chart-container")).toBeVisible();

      await expect(
        filterWidget(card1, { isEditing: true, name: "Category 1" }),
      ).toBeVisible();
      await filterWidget(card1, { isEditing: true, name: "Category 1" }).click();

      // Verify the Count filter is connected to a new card
      await editingDashboardParametersContainer(page)
        .getByText("Count", { exact: true })
        .click();
      await expect(
        card1.getByTestId("parameter-mapper-container").getByText(/Count/),
      ).toBeVisible();
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      // Verify first card's filter isn't connected to a new card
      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();
      await expect(
        card1.getByTestId("parameter-mapper-container").getByText(/Category/),
      ).toHaveCount(0);
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      // Verify new card's filter is connected to the new card
      await filterWidget(card1, { isEditing: true, name: "Category 1" }).click();
      await expect(
        card1.getByTestId("parameter-mapper-container").getByText(/Category/),
      ).toBeVisible();

      const updateDashboard = waitForDashboardPut(page);
      await saveDashboard(page);

      const payload = (await updateDashboard)
        .request()
        .postDataJSON() as DashboardPutPayload;
      expect(payload.parameters).toHaveLength(3);
      for (const dashcard of payload.dashcards) {
        expect(dashcard.inline_parameters).toHaveLength(1);
        expect(dashcard.parameter_mappings).toHaveLength(2);
      }

      // Verify filtering works independently
      await dashboardParametersContainer(page)
        .getByText("Count", { exact: true })
        .click();
      await popover(page).getByPlaceholder("Enter a number").fill("5000");
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await filterWidget(getDashboardCard(page, 0), {
        name: "Category",
      }).click();
      await popover(page).getByLabel("Widget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await filterWidget(card1, { name: "Category 1" }).click();
      await popover(page).getByLabel("Doohickey", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await applyFilterButton(page).click();

      await expect(
        getDashboardCard(page, 0).getByText(/No results/),
      ).toBeVisible();
      const card1Chart = card1.getByTestId("chart-container");
      await expect(
        card1Chart.getByText("Doohickey", { exact: true }),
      ).toBeVisible();
      await expect(card1Chart.getByText("Gizmo", { exact: true })).toHaveCount(
        0,
      );
      await expect(card1Chart.getByText("Gadget", { exact: true })).toHaveCount(
        0,
      );
      await expect(card1Chart.getByText("Widget", { exact: true })).toHaveCount(
        0,
      );

      await expectSearch(
        page,
        "?category=Widget&category_1=Doohickey&count=5000",
      );
    });

    test("should duplicate filters when duplicating a dashboard", async ({
      page,
      mb,
    }) => {
      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryParameter] },
        });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          {
            id: dashcardId,
            inline_parameters: [categoryParameter.id],
            parameter_mappings: [categoryMapping(cardId)],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboardId);

      await openDashboardMenu(page, "Duplicate");
      await modal(page).getByRole("button", { name: "Duplicate" }).click();
      await expect(
        dashboardHeader(page).getByText("Test Dashboard - Duplicate", {
          exact: true,
        }),
      ).toBeVisible();

      const card0 = getDashboardCard(page, 0);
      await expect(card0.getByText("Doohickey", { exact: true })).toBeVisible();
      await expect(card0.getByText("Gizmo", { exact: true })).toBeVisible();
      await expect(card0.getByText("Gadget", { exact: true })).toBeVisible();
      await expect(card0.getByText("Widget", { exact: true })).toBeVisible();

      await filterWidget(card0, { name: "Category" }).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      const card0Chart = card0.getByTestId("chart-container");
      await expect(
        card0Chart.getByText("Gadget", { exact: true }),
      ).toBeVisible();
      await expect(
        card0Chart.getByText("Doohickey", { exact: true }),
      ).toHaveCount(0);
      await expect(card0Chart.getByText("Gizmo", { exact: true })).toHaveCount(
        0,
      );
      await expect(card0Chart.getByText("Widget", { exact: true })).toHaveCount(
        0,
      );

      await expectSearch(page, "?category=Gadget");
    });

    test("should not allow connecting inline parameters to cards on a different tab", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api, {
        questionDetails: ordersCountByCategory,
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      // Add a second card
      await openQuestionsSidebar(page);
      await sidebar(page).getByText("Orders, Count", { exact: true }).click();

      // Add a second tab
      await createNewTab(page);
      await goToTab(page, "Tab 2");

      // Add a question to the second tab
      await sidebar(page).getByText("Orders, Count", { exact: true }).click();

      await goToTab(page, "Tab 1");

      // Add a filter to the first card
      await setDashCardFilter(page, 0, "Text or Category", null, "Category");
      await selectDashboardFilter(getDashboardCard(page, 0), "Category");

      await goToTab(page, "Tab 2");

      // Ensure the filter can't be connected to the second card
      await expect(
        getDashboardCard(page, 0).getByText(
          "The selected filter is on another tab.",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("should allow connecting inline parameters only to their own card", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api, {
        questionDetails: ordersCountByCategory,
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      // Add a second card
      await openQuestionsSidebar(page);
      await sidebar(page).getByText("Orders, Count", { exact: true }).click();
      await expect(
        getDashboardCard(page, 1).getByText("Count", { exact: true }).first(),
      ).toBeVisible();

      // Add a filter to the first card
      await setDashCardFilter(page, 0, "Text or Category", null, "Category");
      await selectDashboardFilter(getDashboardCard(page, 0), "Category");

      // Ensure the filter can't be connected to the second card
      await expect(
        getDashboardCard(page, 1).getByText(
          "This filter can only connect to its own card.",
          { exact: true },
        ),
      ).toBeVisible();

      // Disconnect the filter from the first card
      await sidebar(page)
        .getByText("Disconnect from card", { exact: true })
        .click();

      // Ensure it still can't be connected to the second card
      await expect(
        getDashboardCard(page, 1).getByText(
          "This filter can only connect to its own card.",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("should show all inline parameters when editing one parameter mapping", async ({
      page,
      mb,
    }) => {
      const categoryFilter = mockParameter({
        id: "category123",
        name: "Category",
        type: "string/=",
        slug: "category",
        sectionId: "string",
      });

      const countFilter = mockParameter({
        id: "count456",
        name: "Count",
        type: "number/=",
        slug: "count",
        sectionId: "number",
      });

      const { cardId, dashboardId, dashcardId } =
        await createQuestionAndDashboard(mb.api, {
          questionDetails: ordersCountByCategory,
          dashboardDetails: { parameters: [categoryFilter, countFilter] },
        });

      // Update the dashcard to have inline parameters
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [
          {
            id: dashcardId,
            inline_parameters: [categoryFilter.id, countFilter.id],
            parameter_mappings: [
              {
                parameter_id: categoryFilter.id,
                card_id: cardId,
                target: ["dimension", categoryFieldRef, { "stage-number": 0 }],
              },
            ],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      const card0 = getDashboardCard(page, 0);

      // Both filters should be visible
      await expect(
        filterWidget(card0, { isEditing: true, name: "Category" }),
      ).toBeVisible();
      await expect(
        filterWidget(card0, { isEditing: true, name: "Count" }),
      ).toBeVisible();

      // Click on Category filter to open its mapping sidebar
      await filterWidget(card0, { isEditing: true, name: "Category" }).click();

      // Verify the sidebar opened for Category parameter
      await expect(sidebar(page).getByLabel("Label")).toHaveValue("Category");

      // Both filters should still be visible during mapping mode
      await expect(
        filterWidget(card0, { isEditing: true, name: "Category" }),
      ).toBeVisible();
      await expect(
        filterWidget(card0, { isEditing: true, name: "Count" }),
      ).toBeVisible();

      // Should be able to click on Count filter while Category mapping is open
      await filterWidget(card0, { isEditing: true, name: "Count" }).click();

      // The sidebar should now show Count parameter settings
      await expect(sidebar(page).getByLabel("Label")).toHaveValue("Count");

      // Both filters should still be visible
      await expect(
        filterWidget(card0, { isEditing: true, name: "Category" }),
      ).toBeVisible();
      await expect(
        filterWidget(card0, { isEditing: true, name: "Count" }),
      ).toBeVisible();
    });

    test("should not show add filter button for users with no data editing permissions", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api, {
        questionDetails: ordersCountByCategory,
      });

      await mb.signIn("nodata");
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      const card0 = getDashboardCard(page, 0);
      await card0.hover();
      await expect(
        card0.getByTestId("dashboardcard-actions-panel"),
      ).toBeVisible();

      // Ensure the "Add a filter" button is not present
      await expect(card0.getByLabel("Add a filter")).toHaveCount(0);
    });
  });

  test.describe("moving filters", () => {
    const categoryParameter = mockParameter({
      id: "1b9cd9f1",
      name: "Category",
      type: "string/=",
      slug: "category",
      sectionId: "string",
    });

    const countParameter = mockParameter({
      id: "88a1257c",
      name: "Count",
      type: "number/<=",
      slug: "count",
      sectionId: "number",
    });

    const categoryFieldRef = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    test("should allow moving filters on a single tab dashboard", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api, {
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
        questionDetails: {
          display: "bar",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [categoryFieldRef],
          },
        },
        cardDetails: {
          inline_parameters: [categoryParameter.id],
        },
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      // Wire-up filters with the card
      await filterWidget(editingDashboardParametersContainer(page), {
        isEditing: true,
        name: "Count",
      }).click();
      await selectDashboardFilter(getDashboardCard(page, 0), "Count");
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();
      await selectDashboardFilter(getDashboardCard(page, 0), "Category");

      // Move card filter to the header
      await moveDashboardFilter(page, "Top of page");

      await expect(
        getDashboardCard(page, 0).getByText("Category", { exact: true }),
      ).toHaveCount(0);
      await expect(
        filterWidget(editingDashboardParametersContainer(page), {
          isEditing: true,
          name: "Category",
        }),
      ).toBeVisible();

      // Move header filter to the card
      await filterWidget(editingDashboardParametersContainer(page), {
        isEditing: true,
        name: "Count",
      }).click();
      await moveDashboardFilter(page, "test question");

      await expect(
        filterWidget(getDashboardCard(page, 0), {
          isEditing: true,
          name: "Count",
        }),
      ).toBeVisible();
      await expect(
        filterWidget(editingDashboardParametersContainer(page), {
          isEditing: true,
          name: "Count",
        }),
      ).toHaveCount(0);

      // Save and assert changes are applied
      await saveDashboard(page);
      await expect(
        filterWidget(getDashboardCard(page, 0), { name: "Count" }),
      ).toBeVisible();
      await expect(
        filterWidget(dashboardParametersContainer(page), { name: "Count" }),
      ).toHaveCount(0);
    });

    test("should allow moving filters on a dashboard with tabs", async ({
      page,
      mb,
    }) => {
      const TAB_1 = { id: 1, name: "Tab 1" };
      const TAB_2 = { id: 2, name: "Tab 2" };

      const dashboard = await createDashboardWithTabs(mb.api, {
        parameters: [categoryParameter, countParameter],
        tabs: [TAB_1, TAB_2],
        dashcards: [
          mockHeadingDashboardCard({
            id: -1,
            dashboard_tab_id: TAB_2.id,
            inline_parameters: [categoryParameter.id],
            size_x: 24,
            size_y: 2,
          }),
          mockQuestionDashboardCard({
            id: -2,
            card_id: ORDERS_BY_YEAR_QUESTION_ID,
            dashboard_tab_id: TAB_1.id,
            inline_parameters: [countParameter.id],
            parameter_mappings: [
              {
                parameter_id: countParameter.id,
                card_id: ORDERS_BY_YEAR_QUESTION_ID,
                target: [
                  "dimension",
                  ["field", "count", { "base-type": "type/Integer" }],
                  { "stage-number": 1 },
                ],
              },
            ],
            row: 1,
            size_x: 18,
            size_y: 6,
          }),
        ],
      });
      await visitDashboard(page, mb.api, dashboard.id);
      await editDashboard(page);

      // Move filter from tab 1 to tab 2
      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Count",
      }).click();

      await moveDashboardFilter(page, "Heading Text");
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      await expect(
        getDashboardCard(page, 0).getByTestId("editing-parameter-widget"),
      ).toHaveCount(0);
      await expect(editingDashboardParametersContainer(page)).toHaveCount(0);

      // Move filter from tab 2 to tab 1
      await goToTab(page, "Tab 2");

      await expect(
        filterWidget(getDashboardCard(page, 0), {
          isEditing: true,
          name: "Count",
        }),
      ).toBeVisible();
      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();

      await moveDashboardFilter(page, /Orders, Count/);
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      await expect(
        filterWidget(getDashboardCard(page, 0), {
          isEditing: true,
          name: "Category",
        }),
      ).toHaveCount(0);
      await expect(editingDashboardParametersContainer(page)).toHaveCount(0);

      await goToTab(page, "Tab 1");
      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();
      await selectDashboardFilter(getDashboardCard(page, 0), "Category");
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      // Save and assert changes are applied
      await saveDashboard(page);
      await expect(
        filterWidget(getDashboardCard(page, 0), { name: "Category" }),
      ).toBeVisible();
      await expect(
        filterWidget(getDashboardCard(page, 0), { name: "Count" }),
      ).toHaveCount(0);
    });

    test("should allow undoing a move", async ({ page, mb }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api, {
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
        questionDetails: {
          display: "bar",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [categoryFieldRef],
          },
        },
        cardDetails: {
          inline_parameters: [categoryParameter.id],
          size_x: 18,
        },
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      // Move card filter to the header
      await filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Category",
      }).click();
      await dashboardParameterSidebar(page)
        .getByPlaceholder("Move filter")
        .click();
      await popover(page).getByText("Top of page", { exact: true }).click();

      // Undo
      await undo(page);
      await expect(
        filterWidget(getDashboardCard(page, 0), {
          isEditing: true,
          name: "Category",
        }),
      ).toBeVisible();
      await expect(
        filterWidget(editingDashboardParametersContainer(page), {
          isEditing: true,
          name: "Category",
        }),
      ).toHaveCount(0);

      // Move header filter to the card
      await filterWidget(editingDashboardParametersContainer(page), {
        isEditing: true,
        name: "Count",
      }).click();
      await dashboardParameterSidebar(page)
        .getByPlaceholder("Move filter")
        .click();
      await popover(page).getByText("test question", { exact: true }).click();
      await dashboardParameterSidebar(page)
        .getByRole("button", { name: "Done" })
        .click();

      // Undo
      await undo(page);
      await expect(
        filterWidget(getDashboardCard(page, 0), {
          isEditing: true,
          name: "Count",
        }),
      ).toHaveCount(0);
      await expect(
        filterWidget(editingDashboardParametersContainer(page), {
          isEditing: true,
          name: "Count",
        }),
      ).toBeVisible();
    });

    test("should provide a way to 'focus' the recently moved filter", async ({
      page,
      mb,
    }) => {
      const TAB_1 = { id: 1, name: "Tab 1" };
      const TAB_2 = { id: 2, name: "Tab 2" };

      const dashboard = await createDashboardWithTabs(mb.api, {
        parameters: [categoryParameter, countParameter],
        tabs: [TAB_1, TAB_2],
        dashcards: [
          mockQuestionDashboardCard({
            id: -1,
            card_id: ORDERS_BY_YEAR_QUESTION_ID,
            dashboard_tab_id: TAB_1.id,
            size_x: 18,
            size_y: 6,
          }),
          mockHeadingDashboardCard({
            id: -2,
            dashboard_tab_id: TAB_2.id,
            size_x: 24,
            size_y: 30,
            text: "Tall heading card",
          }),
          mockHeadingDashboardCard({
            id: -3,
            dashboard_tab_id: TAB_2.id,
            size_x: 24,
            size_y: 2,
            text: "Heading text card",
          }),
        ],
      });
      await visitDashboard(page, mb.api, dashboard.id);
      await editDashboard(page);

      await filterWidget(editingDashboardParametersContainer(page), {
        isEditing: true,
        name: "Count",
      }).click();
      await moveDashboardFilter(page, "Heading text card", {
        showFilter: true,
      });

      // Assert tab changed and the filter is in viewport now
      await expect(page.getByRole("tab", { name: "Tab 2" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      const movedToHeading = filterWidget(getDashboardCard(page, 1), {
        isEditing: true,
        name: "Count",
      });
      await expect(movedToHeading).toBeVisible();
      // Retry the viewport check while the scroll-into-view settles.
      await expect(async () => {
        await expectRenderedWithinViewport(movedToHeading);
      }).toPass({ timeout: 10_000 });

      // Move filter to another card on the same tab
      await moveDashboardFilter(page, "Tall heading card", {
        showFilter: true,
      });
      const movedToTallHeading = filterWidget(getDashboardCard(page, 0), {
        isEditing: true,
        name: "Count",
      });
      await expect(movedToTallHeading).toBeVisible();
      await expect(async () => {
        await expectRenderedWithinViewport(movedToTallHeading);
      }).toPass({ timeout: 10_000 });

      // Move filter to top nav and assert the "Show filter" button isn't displayed
      await moveDashboardFilter(page, "Top of page");
      await expect(
        undoToast(page).getByRole("button", { name: "Show filter" }),
      ).toHaveCount(0);
    });
  });
});

test.describe("scenarios > dashboard > parameters", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow();
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("should track dashboard_filter_created event when adding a filter", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    // Ensure tracking is triggered for question dashcard parameters
    await setDashCardFilter(page, 0, "Text or Category", null, "Category");
    await selectDashboardFilter(getDashboardCard(page, 0), "Category");

    await expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_created",
      triggered_from: "table",
      event_detail: "string",
      target_id: ORDERS_DASHBOARD_ID,
    });

    await dashboardParameterSidebar(page)
      .getByRole("button", { name: "Done" })
      .click();

    // Ensure tracking is triggered for heading dashcard parameters
    await addHeadingWhileEditing(page, "Heading Text");
    await setDashCardFilter(page, 1, "Text or Category", null, "Category 2");

    await expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_created",
      triggered_from: "heading",
      event_detail: "string",
      target_id: ORDERS_DASHBOARD_ID,
    });

    await dashboardParameterSidebar(page)
      .getByRole("button", { name: "Done" })
      .click();

    // Ensure tracking is triggered for dashboard parameters
    await setFilter(page, "ID");

    await expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_created",
      triggered_from: null,
      event_detail: "id",
      target_id: ORDERS_DASHBOARD_ID,
    });
  });

  test("should track dashboard_filter_moved event when moving a filter", async ({
    page,
    mb,
  }) => {
    const { dashboardId } = await createQuestionAndDashboard(mb.api, {
      dashboardDetails: {
        parameters: [
          mockParameter({
            id: "1b9cd9f1",
            name: "Category",
            type: "string/=",
            slug: "category",
            sectionId: "string",
          }),
        ],
      },
      questionDetails: {
        display: "bar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
      },
    });
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);
    await addHeadingWhileEditing(page, "heading card");

    await filterWidget(editingDashboardParametersContainer(page), {
      isEditing: true,
      name: "Category",
    }).click();

    await moveDashboardFilter(page, "test question");
    await expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_moved",
      triggered_from: null,
      event_detail: "bar",
      target_id: dashboardId,
    });

    await moveDashboardFilter(page, "heading card");
    await expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_moved",
      triggered_from: "bar",
      event_detail: "heading",
      target_id: dashboardId,
    });

    await moveDashboardFilter(page, "Top of page");
    await expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_moved",
      triggered_from: "heading",
      event_detail: null,
      target_id: dashboardId,
    });
  });
});
