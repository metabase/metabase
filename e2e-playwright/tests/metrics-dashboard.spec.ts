/**
 * Playwright port of e2e/test/scenarios/metrics/metrics-dashboard.cy.spec.js
 *
 * Metrics on dashboards: combine metrics on a visualizer dashcard, add a metric
 * to a dashboard (context menu + questions sidebar), replace a card with a
 * metric, filter + drill from a metric dashcard, and click behaviors on a
 * metric dashcard.
 *
 * Dropped intercept: the `@cardQuery` alias (POST /api/card/*\/query) is
 * registered in the Cypress beforeEach but never awaited — not ported (rule 2).
 * The `@dataset` and `@search` aliases ARE awaited, and are registered before
 * their triggering actions here.
 */
import { createDashboardWithQuestions } from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  MetricPage,
  cartesianChartCircles,
  visitMetric,
} from "../support/metrics";
import { chartLegendItem } from "../support/metrics-dashboard";
import { SAMPLE_DATABASE, ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import { getDashboardCards } from "../support/dashboard-core";
import { entityPickerModal, assertQueryBuilderRowCount } from "../support/notebook";
import { undoToastList } from "../support/organization";
import { modal, popover, visitDashboard } from "../support/ui";
import {
  openQuestionsSidebar,
  selectDataset,
  showDashcardVisualizerModal,
  switchToAddMoreData,
} from "../support/visualizer-basics";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_TIMESERIES_METRIC = {
  name: "Count of orders over time",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line",
};

const PRODUCTS_SCALAR_METRIC = {
  name: "Count of products",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const PRODUCTS_TIMESERIES_METRIC = {
  name: "Count of products over time",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PRODUCTS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line",
};

test.describe("scenarios > metrics > dashboard", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to combine scalar metrics on a dashcard", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [ORDERS_SCALAR_METRIC],
    });
    await mb.api.createQuestion(PRODUCTS_SCALAR_METRIC);
    await visitDashboard(page, mb.api, dashboard.id);
    await editDashboard(page);

    // Cypress opened this via realHover + "Visualize another way"; the shared
    // helper does exactly that (isVisualizerCard: false) and also asserts the
    // modal actually opened before the loader checks.
    await showDashcardVisualizerModal(page, 0, { isVisualizerCard: false });

    const dialog = modal(page);
    await switchToAddMoreData(page);
    await selectDataset(page, PRODUCTS_SCALAR_METRIC.name);
    const canvas = dialog.getByTestId("visualization-canvas");
    // On the funnel and on the horizontal well.
    await expect(
      canvas.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
    ).toHaveCount(2);
    await expect(
      canvas.getByText(PRODUCTS_SCALAR_METRIC.name, { exact: true }).first(),
    ).toBeAttached();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await saveDashboard(page);

    const card = getDashboardCard(page);
    // On the funnel and on the horizontal well.
    await expect(
      card.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
    ).toHaveCount(2);
    await expect(
      card.getByText(PRODUCTS_SCALAR_METRIC.name, { exact: true }),
    ).toBeVisible();
  });

  test("should be able to combine timeseries metrics on a dashcard (metabase#42575)", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [ORDERS_TIMESERIES_METRIC],
    });
    await mb.api.createQuestion(PRODUCTS_TIMESERIES_METRIC);
    await visitDashboard(page, mb.api, dashboard.id);
    await editDashboard(page);

    await showDashcardVisualizerModal(page, 0, { isVisualizerCard: false });

    const dialog = modal(page);
    await switchToAddMoreData(page);
    await selectDataset(page, PRODUCTS_TIMESERIES_METRIC.name);
    await expect(
      chartLegendItem(dialog, ORDERS_TIMESERIES_METRIC.name),
    ).toBeAttached();
    await expect(
      chartLegendItem(dialog, PRODUCTS_TIMESERIES_METRIC.name),
    ).toBeAttached();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await saveDashboard(page);

    const card = getDashboardCard(page);
    await expect(
      chartLegendItem(card, ORDERS_TIMESERIES_METRIC.name),
    ).toBeAttached();
    await expect(
      chartLegendItem(card, PRODUCTS_TIMESERIES_METRIC.name),
    ).toBeAttached();
  });

  test("should be possible to add metric to a dashboard via context menu (metabase#44220)", async ({
    page,
    mb,
  }) => {
    const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await visitMetric(page, metric.id);
    await expect(MetricPage.aboutPage(page)).toBeVisible();

    // Add metric to a dashboard via context menu
    await MetricPage.moreMenu(page).click();
    await popover(page)
      .getByText("Add to a dashboard", { exact: true })
      .click();
    const dialog = modal(page);
    await expect(
      dialog.getByRole("heading", { name: "Add this metric to a dashboard" }),
    ).toBeVisible();
    await dialog.getByText("Orders in a dashboard", { exact: true }).click();
    await dialog.getByRole("button", { name: "Select", exact: true }).click();

    // Assert it's been added before the save
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(`/dashboard/${ORDERS_DASHBOARD_ID}-orders-in-a-dashboard`);
    await expect(page.getByTestId("scalar-value")).toHaveText("18,760");

    // Assert we can save the dashboard with the metric
    await saveDashboard(page);
    await expect(getDashboardCards(page)).toHaveCount(2);
    await expect(page.getByTestId("scalar-value")).toHaveText("18,760");
  });

  test("should be possible to add metrics to a dashboard", async ({
    page,
    mb,
  }) => {
    await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await mb.api.createQuestion(ORDERS_TIMESERIES_METRIC);
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await openQuestionsSidebar(page);

    const addCardSidebar = page.getByTestId("add-card-sidebar");
    await addCardSidebar
      .getByText(ORDERS_SCALAR_METRIC.name, { exact: true })
      .click();
    const search = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/search",
    );
    await addCardSidebar
      .getByPlaceholder("Search…")
      .pressSequentially(ORDERS_TIMESERIES_METRIC.name);
    await search;
    await expect(
      addCardSidebar.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
    ).toHaveCount(0);
    await addCardSidebar
      .getByText(ORDERS_TIMESERIES_METRIC.name, { exact: true })
      .click();

    const scalarCard = getDashboardCard(page, 1);
    await expect(
      scalarCard.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
    ).toBeVisible();
    await expect(scalarCard.getByText("18,760", { exact: true })).toBeVisible();

    const timeseriesCard = getDashboardCard(page, 2);
    await expect(
      timeseriesCard.getByText(ORDERS_TIMESERIES_METRIC.name, { exact: true }),
    ).toBeVisible();
    await expect(timeseriesCard.getByTestId("chart-container")).toBeVisible();
  });

  test("should be able to add a filter and drill thru", async ({ page, mb }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [ORDERS_SCALAR_METRIC],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    await expect(
      getDashboardCard(page).getByText("18,760", { exact: true }),
    ).toBeVisible();
    const header = page.getByTestId("dashboard-header");
    await header.getByLabel("Edit dashboard").click();
    await header.getByLabel("Add a filter or parameter").click();
    await popover(page).getByText("Text or Category", { exact: true }).click();
    await getDashboardCard(page).getByText("Select…", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();
    await saveDashboard(page);

    await filterWidget(page).click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();

    const card = getDashboardCard(page);
    await expect(card.getByText("4,939", { exact: true })).toBeVisible();
    await card.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }).click();

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Product → Category is Gadget", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("scalar-container").getByText("4,939", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to replace a card with a metric", async ({
    page,
    mb,
  }) => {
    await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await getDashboardCard(page).hover();
    await getDashboardCard(page).getByLabel("Replace").click();
    await entityPickerModal(page)
      .getByText(ORDERS_SCALAR_METRIC.name, { exact: true })
      .click();
    await expect(
      undoToastList(page).last().getByText("Question replaced", { exact: true }),
    ).toBeVisible();
    {
      const card = getDashboardCard(page);
      await expect(
        card.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
      ).toBeVisible();
      await expect(card.getByText("18,760", { exact: true })).toBeVisible();
    }

    await getDashboardCard(page).hover();
    await getDashboardCard(page).getByLabel("Replace").click();
    await entityPickerModal(page)
      .getByText(ORDERS_SCALAR_METRIC.name, { exact: true })
      .waitFor();
    await entityPickerModal(page).getByText("Orders", { exact: true }).click();
    await expect(
      undoToastList(page).last().getByText("Metric replaced", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page).getByText("Orders", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to use click behaviors with metrics on a dashboard", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [ORDERS_TIMESERIES_METRIC],
    });
    await visitDashboard(page, mb.api, dashboard.id);
    await editDashboard(page);

    await getDashboardCard(page).hover();
    await getDashboardCard(page).getByLabel("Click behavior").click();
    await sidebar(page)
      .getByText("Go to a custom destination", { exact: true })
      .click();
    await sidebar(page).getByText("Saved question", { exact: true }).click();
    await modal(page).getByText("Orders", { exact: true }).click();
    await sidebar(page).getByText("User ID", { exact: true }).click();
    await popover(page).getByText("Count", { exact: true }).click();
    await sidebar(page).getByRole("button", { name: "Done", exact: true }).click();
    await saveDashboard(page);

    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    // Single metric dashcard → one chart-container, so page scope resolves it
    // (Cypress ran this inside getDashboardCard().within()).
    await cartesianChartCircles(page)
      .nth(5) // random dot
      .click({ force: true });
    await dataset;

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("User ID is 92", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 8);
  });
});
