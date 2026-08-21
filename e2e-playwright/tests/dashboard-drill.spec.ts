/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/dashboard-drill.cy.spec.js
 *
 * Drill-through from a dashboard card: click a value / legend / chart bar →
 * drill menu → filtered question / underlying records / object detail, plus the
 * custom click-behavior destinations (URL / saved question / dashboard /
 * cross-filter) configured through the dashcard's click-behavior sidebar.
 *
 * Notes vs the original:
 * - Callback-nested factories (createQuestion → createDashboard →
 *   createDashboardWithQuestion) flatten to awaited helpers in
 *   support/dashboard-drill.ts.
 * - `H.sidebar()` is `cy.get("main aside")` (the click-behavior sidebar), NOT
 *   the `sidebar-right` testid — see the `sidebar` helper.
 * - The `.parent().parent().within(...)` positional scoping upstream used to
 *   reach a section's column list collapses to an exact getByText inside the
 *   sidebar (the labels are unique there).
 * - `cy.intercept("POST", "/api/dataset").as("dataset")` + `cy.wait` →
 *   waitForResponse registered before the triggering click (PORTING rule 2);
 *   `xhr.response.body.error` checks read the response json.
 * - Retried `cy.location(...).should(...)` → expect.poll (one-shot URL checks
 *   catch transient states — PORTING.md).
 * - `.trigger("mousemove")` on a chart path → synthetic MouseEvent dispatch
 *   (triggerMousemove), not real hover (wave-13 rule).
 * - The @skip cross-filter test is ported as test.skip, faithfully (upstream
 *   tagged it @skip for flakiness).
 */
import type { DashCard } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { ORDERS_DASHBOARD_DASHCARD_ID } from "../support/dashboard-core";
import {
  createDashboard,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { editDashboardCard } from "../support/filters-repros";
import {
  editBar,
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDropdown,
} from "../support/dashboard";
import { showDashboardCardActions } from "../support/dashboard-cards";
import { chartPathWithFillColor } from "../support/binning";
import { echartsContainer } from "../support/charts";
import { assertEChartsTooltip } from "../support/viz-charts-repros";
import { triggerMousemove } from "../support/line-chart";
import { tableInteractiveBody } from "../support/question-new";
import {
  assertQueryBuilderRowCount,
  entityPickerModal,
  queryBuilderMain,
  tableHeaderClick,
  tableHeaderColumn,
} from "../support/notebook";
import { caseSensitiveSubstring as caseSensitive } from "../support/text";
import {
  icon,
  main,
  modal,
  popover,
  queryBuilderHeader,
  visitDashboard,
} from "../support/ui";
import {
  createDashboardWithQuestion,
  createDrillDashboard,
  createDrillQuestion,
  drillThroughCardTitle,
  setParamValue,
  sidebar,
} from "../support/dashboard-drill";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID, PEOPLE } =
  SAMPLE_DATABASE;

const DATASET_PATH = "/api/dataset";

/** Register a wait for the next POST /api/dataset. */
function waitForDataset(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === DATASET_PATH,
  );
}

test.describe("scenarios > dashboard > dashboard drill", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    void page;
  });

  test("should handle URL click through on a table", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithQuestion(mb.api, {});
    await visitDashboard(page, mb.api, dashboardId);

    await icon(page.getByTestId("dashboard-header"), "pencil").click();
    await showDashboardCardActions(page);
    await icon(
      page.getByTestId("dashboardcard-actions-panel"),
      "click",
    ).click();

    // configure a URL click through on the "MY_NUMBER" column
    await sidebar(page).getByText("MY_NUMBER", { exact: true }).click();
    await page
      .getByText("Go to a custom destination", { exact: true })
      .click();
    await page.getByText("URL", { exact: true }).click();

    // set the url and text template
    await modal(page).locator("input").first().fill("/foo/{{my_number}}/{{my_param}}");
    await modal(page)
      .locator("input")
      .last()
      .fill("column value: {{my_number}}");
    await modal(page).locator("input").last().blur();
    await modal(page).getByText("Done", { exact: true }).click();

    await editBar(page).getByText("Save", { exact: true }).click();

    await setParamValue(page, "My Param", "param-value");
    // click value and confirm url updates
    await getDashboardCard(page).getByText("column value: 111").click();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/foo/111/param-value");
  });

  test("should insert values from hidden column on custom destination URL click through (metabase#13927)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "13927",
      native: { query: "SELECT PEOPLE.STATE, PEOPLE.CITY from PEOPLE;" },
    };

    const clickBehavior = {
      "table.cell_column": "CITY",
      "table.pivot_column": "STATE",
      column_settings: {
        '["name","CITY"]': {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTextTemplate:
              "Click to find out which state does {{CITY}} belong to.",
            linkTemplate: "/test/{{STATE}}",
          },
        },
      },
      "table.columns": [
        {
          name: "STATE",
          fieldRef: ["field", "STATE", { "base-type": "type/Text" }],
          enabled: false,
        },
        {
          name: "CITY",
          fieldRef: ["field", "CITY", { "base-type": "type/Text" }],
          enabled: true,
        },
      ],
    };

    const dashcard = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails,
    });
    const { questionId, cardId, dashboardId, dashcardId, ...cleanCard } =
      dashcard;
    void questionId;
    void cardId;
    void dashboardId;
    void dashcardId;
    await editDashboardCard(mb.api, cleanCard as DashCard, {
      visualization_settings: clickBehavior,
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await page
      .getByText("Click to find out which state does Rye belong to.")
      .click();

    // Reported failing on v0.37.2
    await expect.poll(() => new URL(page.url()).pathname).toBe("/test/CO");
  });

  test("should insert data from the correct row in the URL for pivot tables (metabase#17920)", async ({
    page,
    mb,
  }) => {
    const query =
      "SELECT STATE, SOURCE, COUNT(*) AS CNT from PEOPLE GROUP BY STATE, SOURCE";
    const questionSettings = {
      "table.pivot": true,
      "table.pivot_column": "SOURCE",
      "table.cell_column": "CNT",
    };
    const columnKey = JSON.stringify(["name", "CNT"]);
    const dashCardSettings = {
      column_settings: {
        [columnKey]: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "/test/{{CNT}}/{{STATE}}/{{SOURCE}}",
          },
        },
      },
    };

    const questionId = await createDrillQuestion(mb.api, {
      query,
      visualization_settings: questionSettings,
    });
    const dashboardId = await createDrillDashboard(mb.api, {
      questionId,
      visualization_settings: dashCardSettings,
    });
    await visitDashboard(page, mb.api, dashboardId);

    // querying the element before clicking to ensure its stability
    const targetCell = tableInteractiveBody(page)
      .getByRole("row")
      .nth(5)
      .getByText("18", { exact: true });
    await targetCell.click({ force: true });
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/test/18/CO/Organic");
  });

  test("should handle question click through on a table", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboardWithQuestion(mb.api, {});
    await visitDashboard(page, mb.api, dashboardId);

    await page.getByLabel("Edit dashboard").click();
    await showDashboardCardActions(page);
    await page.getByLabel("Click behavior").click();

    // Configuring on-click behavior for MY_NUMBER column
    await sidebar(page).getByText("MY_NUMBER", { exact: true }).click();
    await sidebar(page)
      .getByText("Go to a custom destination", { exact: true })
      .click();
    await sidebar(page).getByText("Saved question", { exact: true }).click();

    await modal(page).getByText("Orders", { exact: true }).click();

    await sidebar(page).getByText("User ID", { exact: true }).click();
    await popover(page).getByText("MY_NUMBER", { exact: true }).click();

    await sidebar(page).getByText("Product → Category", { exact: true }).click();
    await popover(page).getByText("My Param", { exact: true }).click();

    await sidebar(page)
      .getByRole("textbox", { name: /Customize link text/ })
      .fill("num: {{my_number}}");

    await editBar(page).getByRole("button", { name: "Save" }).click();

    // wait to leave editing mode and set a param value
    await expect(
      main(page).getByText("You're editing this dashboard."),
    ).toHaveCount(0);
    await setParamValue(page, "My Param", "Widget");

    // click on table value
    await page.getByTestId("dashcard").getByText("num: 111").click();

    await expect(
      queryBuilderHeader(page).getByText("Orders", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("qb-filters-panel").getByText("User ID is 111", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Product → Category is Widget", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 5);
  });

  test("should handle dashboard click through on a table", async ({
    page,
    mb,
  }) => {
    const questionId = await createDrillQuestion(mb.api, {});
    const dashboardIdA = await createDrillDashboard(mb.api, {
      dashboardName: "start dash",
      questionId,
    });
    await createDashboardWithQuestion(mb.api, { dashboardName: "end dash" });
    await visitDashboard(page, mb.api, dashboardIdA);

    await icon(page, "pencil").click();
    await showDashboardCardActions(page);
    await icon(
      page.getByTestId("dashboardcard-actions-panel"),
      "click",
    ).click();

    // configure clicks on "MY_NUMBER" to update the param
    await sidebar(page).getByText("MY_NUMBER", { exact: true }).click();
    await sidebar(page)
      .getByText("Go to a custom destination", { exact: true })
      .click();
    await sidebar(page).getByText("Dashboard", { exact: true }).click();
    await entityPickerModal(page).getByText("end dash", { exact: true }).click();
    await sidebar(page).getByText("My Param", { exact: true }).click();
    await selectDropdown(page).getByText("MY_STRING", { exact: true }).click();

    // set the text template
    await page
      .getByPlaceholder("E.x. Details for {{Column Name}}")
      .fill("text: {{my_string}}");
    // Cypress's unscoped cy.findByText("Save") — the dashboard edit-bar Save.
    await saveDashboard(page);

    // click on table value
    await getDashboardCard(page).getByText("text: foo").click();

    // check that param was set to "foo"
    await expect.poll(() => new URL(page.url()).search).toBe("?my_param=foo");
    await expect(
      filterWidget(page).getByText("foo", { exact: true }),
    ).toBeVisible();
  });

  test("should open the same dashboard when a custom URL click behavior points to the same dashboard (metabase#22702)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboardWithQuestion(mb.api, {});
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);
    await showDashboardCardActions(page);
    await icon(page.getByTestId("dashboardcard-actions-panel"), "click").click();

    await sidebar(page).getByText("MY_NUMBER", { exact: true }).click();
    await sidebar(page)
      .getByText("Go to a custom destination", { exact: true })
      .click();
    await sidebar(page).getByText("URL", { exact: true }).click();

    await modal(page)
      .locator("input")
      .first()
      .fill(`/dashboard/${dashboardId}?my_param=Aaron Hand`);
    await modal(page).locator("input").last().fill("Click behavior");
    await modal(page).locator("input").last().blur();
    await modal(page).getByRole("button", { name: "Done" }).click();

    await saveDashboard(page);

    await page.getByTestId("dashcard").getByText("Click behavior").click();
    await expect(
      filterWidget(page).getByText("Aaron Hand", { exact: true }),
    ).toBeVisible();

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(`/dashboard/${dashboardId}`);
    await expect
      .poll(() => new URL(page.url()).search)
      .toBe("?my_param=Aaron+Hand");
  });

  // This was flaking. Example: https://dashboard.cypress.io/projects/a394u1/runs/2109/test-results/91a15b66-4b80-40bf-b569-de28abe21f42
  // Upstream tagged @skip; ported faithfully as test.skip.
  test.skip("should handle cross-filter on a table", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithQuestion(mb.api, {});
    await visitDashboard(page, mb.api, dashboardId);
    await icon(page, "pencil").click();
    await showDashboardCardActions(page);
    await icon(
      page.getByTestId("dashboardcard-actions-panel"),
      "click",
    ).click();

    // configure clicks on "MY_NUMBER" to update the param
    await sidebar(page).getByText("MY_NUMBER", { exact: true }).click();
    await sidebar(page)
      .getByText("Update a dashboard filter", { exact: true })
      .click();
    await sidebar(page).getByText("My Param", { exact: true }).click();
    await selectDropdown(page).getByText("MY_STRING", { exact: true }).click();
    await sidebar(page).getByText("Save", { exact: true }).click();

    // click on table value
    await page.getByText("111", { exact: true }).click();

    // check that param was set to "foo"
    await expect.poll(() => new URL(page.url()).search).toBe("?my_param=foo");
    await expect(
      filterWidget(page).filter({ hasText: "My Param" }).getByText("foo"),
    ).toBeVisible();
  });

  test.describe("should pass multiple filters for numeric column on drill-through (metabase#13062)", () => {
    const questionDetails = {
      name: "13062Q",
      query: {
        "source-table": REVIEWS_ID,
      },
    };

    const filter = {
      id: "18024e69",
      name: "Category",
      slug: "category",
      type: "category",
    };

    test.beforeEach(async ({ page, mb }) => {
      // Set "Rating" Field type to: "Category"
      await mb.api.put(`/api/field/${REVIEWS.RATING}`, {
        semantic_type: "type/Category",
      });

      const dashcard = await createQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      const { card_id, dashboard_id, id } = dashcard;

      // Add filter to the dashboard
      await mb.api.put(`/api/dashboard/${dashboard_id}`, {
        parameters: [filter],
      });

      // Connect filter to the dashboard card
      await mb.api.put(`/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 11,
            size_y: 6,
            parameter_mappings: [
              {
                parameter_id: filter.id,
                card_id,
                target: ["dimension", ["field", REVIEWS.RATING, null]],
              },
            ],
          },
        ],
      });

      // set filter values (ratings 5 and 4) directly through the URL
      await page.goto(`/dashboard/${dashboard_id}?category=5&category=4`);
      await expect(page.getByText("2 selections")).toBeVisible();
    });

    test("when clicking on the field value (metabase#13062-1)", async ({
      page,
    }) => {
      await page.getByTestId("dashcard").getByText("xavier").click();
      await popover(page).getByText("Is xavier", { exact: true }).click();

      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("Reviewer is xavier", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("Rating is equal to 2 selections", { exact: true }),
      ).toBeVisible();

      // xavier's review
      await expect(
        queryBuilderMain(page)
          .getByText(caseSensitive("Reprehenderit non error"))
          .first(),
      ).toBeVisible();

      await assertQueryBuilderRowCount(page, 1);
    });

    test("when clicking on the card title (metabase#13062-2)", async ({
      page,
    }) => {
      await page
        .getByTestId("dashcard")
        .getByText(questionDetails.name, { exact: true })
        .click();
      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("Rating is equal to 2 selections", { exact: true }),
      ).toBeVisible();

      // Sample review body
      await expect(
        queryBuilderMain(page)
          .getByText(caseSensitive("Ad perspiciatis quis et consectetur."))
          .first(),
      ).toBeVisible();

      await assertQueryBuilderRowCount(page, 907);
    });
  });

  test("should drill-through on a primary key out of 2000 rows", async ({
    page,
    mb,
  }) => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "7c9ege62";
    const PK_VALUE = "7602";

    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [
        {
          id: FILTER_ID,
          name: "Category",
          slug: "category",
          type: "category",
          default: ["Gadget"],
        },
      ],
    });
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

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await tableHeaderClick(page, "ID");

    const dataset = waitForDataset(page);
    await page
      .locator(".test-Table-ID")
      .filter({ hasText: caseSensitive(PK_VALUE) })
      .first()
      .click();
    await dataset;

    await expect(
      page.getByTestId("object-detail").getByText(PK_VALUE).first(),
    ).toBeVisible();

    await expect
      .poll(() => page.url())
      .toMatch(new RegExp(`/question\\?objectId=${PK_VALUE}#*`));
  });

  test("should drill-through on a foreign key (metabase#8055)", async ({
    page,
    mb,
  }) => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "7c9ege62";

    // Add filter (with the default Category) to the dashboard
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [
        {
          id: FILTER_ID,
          name: "Category",
          slug: "category",
          type: "category",
          default: ["Gadget"],
        },
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

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    // Product ID in the first row (query fails for User ID as well)
    await page.getByText("105", { exact: true }).click();
    const dataset = waitForDataset(page);
    await page.getByText("View details", { exact: true }).click();

    // Reported on v0.29.3
    const datasetResponse = await dataset;
    expect((await datasetResponse.json()).error).toBeUndefined();

    await expect(
      page.getByTestId("object-detail").getByText("Fantastic Wool Shirt"),
    ).toHaveCount(3);
    await expect(
      page
        .getByTestId("object-detail")
        .getByText("Fantastic Wool Shirt")
        .first(),
    ).toBeVisible();
  });

  test("should apply correct date range on a graph drill-through (metabase#13785)", async ({
    page,
    mb,
  }) => {
    // Create a question
    const question = await createQuestion(mb.api, {
      name: "13785",
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "bar",
    });
    const QUESTION_ID = question.id;

    const dashboard = await createDashboard(mb.api);
    const DASHBOARD_ID = dashboard.id;

    // Add filter to the dashboard
    await mb.api.put(`/api/dashboard/${DASHBOARD_ID}`, {
      parameters: [
        {
          id: "4ff53514",
          name: "Date Filter",
          slug: "date_filter",
          type: "date/all-options",
        },
      ],
    });

    // Add question to the dashboard, with click behavior + filter mapping
    await addOrUpdateDashboardCard(mb.api, {
      card_id: QUESTION_ID,
      dashboard_id: DASHBOARD_ID,
      card: {
        visualization_settings: {
          click_behavior: {
            type: "crossfilter",
            parameterMapping: {
              "4ff53514": {
                source: {
                  type: "column",
                  id: "CREATED_AT",
                  name: "Created At",
                },
                target: {
                  type: "parameter",
                  id: "4ff53514",
                },
                id: "4ff53514",
              },
            },
          },
        },
        parameter_mappings: [
          {
            parameter_id: "4ff53514",
            card_id: QUESTION_ID,
            target: ["dimension", ["field", REVIEWS.CREATED_AT, null]],
          },
        ],
      },
    });

    await visitDashboard(page, mb.api, DASHBOARD_ID);

    const cardQuery = page.waitForResponse((response) =>
      new RegExp(
        `/api/dashboard/${DASHBOARD_ID}/dashcard/.*/card/${QUESTION_ID}/query`,
      ).test(new URL(response.url()).pathname),
    );

    // August 2026 (Total of 12 reviews, 9 unique days)
    await chartPathWithFillColor(page, "#509EE3").nth(14).click();

    await cardQuery;
    await expect.poll(() => page.url()).toContain("2026-08");
    await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(1);
    // Since hover doesn't work in Cypress we can't assert on the popover shown
    // when one hovers the bar. But Y-axis should show "12" (total review count).
    await expect(
      echartsContainer(page)
        .locator("text")
        .filter({ hasText: caseSensitive("12") })
        .first(),
    ).toBeVisible();
  });

  test("should keep card's display when doing zoom drill-through from dashboard (metabase#38307)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "38307",
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "bar",
    };

    const dashboardDetails = {
      name: "38307",
    };

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    const dataset = waitForDataset(page);
    // click the first bar on the card's graph and do a zoom drill-through
    await chartPathWithFillColor(page, "#509EE3").nth(0).click();
    await popover(page)
      .getByText("See this month by week", { exact: true })
      .click();

    await dataset;

    // check that the display is still a bar chart by checking a .bar element exists
    await expect(
      chartPathWithFillColor(page, "#509EE3").first(),
    ).toBeVisible();
  });

  test("should not hide custom formatting when click behavior is enabled (metabase#14597)", async ({
    page,
    mb,
  }) => {
    const columnKey = JSON.stringify(["name", "MY_NUMBER"]);
    const questionSettings = {
      column_settings: {
        [columnKey]: {
          number_style: "currency",
          currency_style: "code",
          currency_in_header: false,
        },
      },
    };
    const dashCardSettings = {
      column_settings: {
        [columnKey]: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "/it/worked",
          },
        },
      },
    };

    const questionId = await createDrillQuestion(mb.api, {
      visualization_settings: questionSettings,
    });
    const dashboardId = await createDrillDashboard(mb.api, {
      questionId,
      visualization_settings: dashCardSettings,
    });
    await visitDashboard(page, mb.api, dashboardId);

    // formatting works, so we see "USD" in the table
    await page.getByText("USD 111.00", { exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/it/worked");
  });

  test("should not remove click behavior on 'reset to defaults' (metabase#14919)", async ({
    page,
    mb,
  }) => {
    const LINK_NAME = "Home";

    const question = await createQuestion(mb.api, {
      name: "14919",
      query: { "source-table": PRODUCTS_ID },
    });
    const QUESTION_ID = question.id;

    const dashboard = await createDashboard(mb.api);
    const DASHBOARD_ID = dashboard.id;

    // Add previously added question to the dashboard, with click through behavior
    await addOrUpdateDashboardCard(mb.api, {
      card_id: QUESTION_ID,
      dashboard_id: DASHBOARD_ID,
      card: {
        visualization_settings: {
          column_settings: {
            [`["ref",["field-id",${PRODUCTS.CATEGORY}]]`]: {
              click_behavior: {
                type: "link",
                linkType: "url",
                linkTemplate: "/",
                linkTextTemplate: LINK_NAME,
              },
            },
          },
        },
      },
    });

    await visitDashboard(page, mb.api, DASHBOARD_ID);
    await icon(page, "pencil").click();
    // Edit "Visualization options"
    await showDashboardCardActions(page);
    await icon(page, "palette").click();
    await modal(page).getByText("Reset to defaults", { exact: true }).click();
    await modal(page).getByRole("button", { name: "Done" }).click();
    // Save the whole dashboard
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("You're editing this dashboard."),
    ).toHaveCount(0);
    // Reported failing on v0.38.0 - link gets dropped
    await expect(
      page.getByTestId("dashcard-container").getByText(LINK_NAME).first(),
    ).toBeVisible();
  });

  test('should drill-through on PK/FK to the "object detail" when filtered by explicit joined column (metabase#15331)', async ({
    page,
    mb,
  }) => {
    const question = await createQuestion(mb.api, {
      name: "15331",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
      },
    });
    const QUESTION_ID = question.id;

    const dashboard = await createDashboard(mb.api);
    const DASHBOARD_ID = dashboard.id;

    // Add filter to the dashboard
    await mb.api.put(`/api/dashboard/${DASHBOARD_ID}`, {
      parameters: [
        {
          name: "Date Filter",
          slug: "date_filter",
          id: "354cb21f",
          type: "date/all-options",
        },
      ],
    });
    // Add question to the dashboard
    await addOrUpdateDashboardCard(mb.api, {
      card_id: QUESTION_ID,
      dashboard_id: DASHBOARD_ID,
      card: {
        size_x: 19,
        size_y: 10,
        // Connect dashboard filter to the question
        parameter_mappings: [
          {
            parameter_id: "354cb21f",
            card_id: QUESTION_ID,
            target: [
              "dimension",
              ["joined-field", "Products", ["field-id", PRODUCTS.CREATED_AT]],
            ],
          },
        ],
      },
    });

    // Set the filter to `previous 30 years` directly through the url
    await page.goto(`/dashboard/${DASHBOARD_ID}?date_filter=past30years`);

    await expect(tableHeaderColumn(page, "Quantity")).toBeVisible();
    const dataset = waitForDataset(page);
    const idCell = page.locator(
      "[data-dataset-index='0'] > [data-column-id='ID']",
    );
    // Subject to change - sensitive to year shifting in the Sample Database
    await expect(idCell).toHaveText("3");
    await idCell.click();

    const datasetResponse = await dataset;
    expect((await datasetResponse.json()).error).toBeUndefined();
    await expect(
      page.getByTestId("object-detail").getByText("Subtotal"),
    ).toBeVisible();
    await expect(
      page.getByTestId("object-detail").getByText("52.72"),
    ).toBeVisible();
  });

  test("should display correct tooltip value for multiple series charts on dashboard (metabase#15612)", async ({
    page,
    mb,
  }) => {
    const question1 = await createNativeQuestion(mb.api, {
      name: "15612_1",
      native: { query: 'select 1 as AXIS, 5 as "VALUE"' },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["AXIS"],
        "graph.metrics": ["VALUE"],
      },
    });
    const question2 = await createNativeQuestion(mb.api, {
      name: "15612_2",
      native: { query: 'select 1 as AXIS, 10 as "VALUE"' },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["AXIS"],
        "graph.metrics": ["VALUE"],
      },
    });

    const dashboard = await createDashboard(mb.api);
    const DASHBOARD_ID = dashboard.id;

    // Add the first question to the dashboard, with the second as a series
    await addOrUpdateDashboardCard(mb.api, {
      card_id: question1.id,
      dashboard_id: DASHBOARD_ID,
      card: {
        series: [{ id: question2.id }],
      },
    });

    await visitDashboard(page, mb.api, DASHBOARD_ID);

    const assertTooltipValues = () =>
      assertEChartsTooltip(page, {
        header: "1",
        rows: [
          { name: "15612_1", color: "#88BF4D", value: "5" },
          { name: "15612_2", color: "#98D9D9", value: "10" },
        ],
      });

    await triggerMousemove(chartPathWithFillColor(page, "#88BF4D").first());
    await assertTooltipValues();

    await triggerMousemove(chartPathWithFillColor(page, "#98D9D9").first());
    await assertTooltipValues();
  });

  test.describe("should preserve dashboard filter and apply it to the question on a drill-through (metabase#11503)", () => {
    const ordersIdFilter = {
      name: "Orders ID",
      slug: "orders_id",
      id: "82a5a271",
      type: "id",
      sectionId: "id",
    };

    const productsIdFilter = {
      name: "Products ID",
      slug: "products_id",
      id: "a4dc1976",
      type: "id",
      sectionId: "id",
    };

    const parameters = [ordersIdFilter, productsIdFilter];

    test.beforeEach(async ({ page, mb }) => {
      // Add filters to the dashboard
      await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
        parameters,
      });

      // Connect those filters to the existing dashboard card
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
            visualization_settings: {},
            parameter_mappings: [
              {
                parameter_id: ordersIdFilter.id,
                card_id: ORDERS_QUESTION_ID,
                target: ["dimension", ["field", ORDERS.ID, null]],
              },
              {
                parameter_id: productsIdFilter.id,
                card_id: ORDERS_QUESTION_ID,
                target: [
                  "dimension",
                  [
                    "field",
                    PRODUCTS.ID,
                    {
                      "source-field": ORDERS.PRODUCT_ID,
                    },
                  ],
                ],
              },
            ],
          },
        ],
      });

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    });

    async function setFilterValue(
      page: import("@playwright/test").Page,
      filterName: string,
    ) {
      await filterWidget(page).filter({ hasText: caseSensitive(filterName) }).click();
      await page.getByPlaceholder("Enter an ID").fill("1,2,");
      await page.getByRole("button", { name: "Add filter" }).click();
      await expect(page.getByText("2 selections")).toBeVisible();
    }

    async function postDrillAssertion(
      page: import("@playwright/test").Page,
      filterName: string,
    ) {
      await page
        .getByTestId("qb-filters-panel")
        .getByText(filterName, { exact: true })
        .click();
      // Port of H.popover({ testId: "filter-picker-dropdown" }) — the Cypress
      // helper appends the testid to the popover element selector.
      const dropdown = page
        .locator(
          ".popover[data-state~='visible'][data-testid='filter-picker-dropdown']," +
            "[data-element-id=mantine-popover][data-testid='filter-picker-dropdown']",
        )
        .filter({ visible: true });
      const lastCombobox = dropdown.getByRole("combobox").last();
      await expect(lastCombobox.locator("xpath=..")).toContainText("1");
      await expect(lastCombobox.locator("xpath=..")).toContainText("2");
      await expect(
        dropdown.getByRole("button", { name: "Update filter" }),
      ).toBeVisible();
    }

    test("should correctly drill-through on Orders filter (metabase#11503-1)", async ({
      page,
    }) => {
      await setFilterValue(page, ordersIdFilter.name);

      await drillThroughCardTitle(page, "Orders");

      await expect(
        queryBuilderMain(page).getByText("37.65", { exact: true }),
      ).toBeVisible();
      await expect(
        queryBuilderMain(page).getByText("110.93", { exact: true }),
      ).toBeVisible();
      await expect(
        queryBuilderMain(page).getByText("52.72", { exact: true }),
      ).toHaveCount(0);

      await assertQueryBuilderRowCount(page, 2);

      await postDrillAssertion(page, "ID is 2 selections");
    });

    test("should correctly drill-through on Products filter (metabase#11503-2)", async ({
      page,
    }) => {
      await setFilterValue(page, productsIdFilter.name);

      await drillThroughCardTitle(page, "Orders");
      await expect(
        queryBuilderMain(page).getByText("37.65", { exact: true }),
      ).toHaveCount(0);
      await expect(
        queryBuilderMain(page).getByText("105.12").first(),
      ).toBeVisible();

      await assertQueryBuilderRowCount(page, 191);

      await postDrillAssertion(page, "Product → ID is 2 selections");
    });
  });
});
