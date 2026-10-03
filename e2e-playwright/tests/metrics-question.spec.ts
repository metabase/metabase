/**
 * Playwright port of e2e/test/scenarios/metrics/metrics-question.cy.spec.js
 */
import type { Page } from "@playwright/test";

import { echartsContainer } from "../support/charts";
import { modal } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import {
  MetricPage,
  cartesianChartCircles,
  changeBinningForDimension,
  filterInNotebook,
  undoToast,
  visitMetric,
} from "../support/metrics";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  visualize,
} from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { navigationSidebar, popover, visitQuestion } from "../support/ui";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

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

const MONTH_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

async function createQuestionWithMetric(
  page: Page,
  mb: { api: { createQuestion: (d: any) => Promise<{ id: number }> } },
  metricId: number,
  { display = "line", breakout }: { display?: string; breakout?: unknown } = {},
) {
  const query: Record<string, unknown> = {
    "source-table": ORDERS_ID,
    aggregation: [["metric", metricId]],
  };
  if (breakout) {
    query.breakout = [breakout];
  }
  const { id } = await mb.api.createQuestion({
    name: "Question with metric",
    type: "question",
    display,
    query,
  });
  await visitQuestion(page, id);
}

test.describe("scenarios > metrics > question", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to move a metric to a different collection", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await visitMetric(page, id);

    await MetricPage.moreMenu(page).click();
    await popover(page).getByText("Move", { exact: true }).click();
    const dialog = modal(page);
    await dialog.getByText("First collection", { exact: true }).click();
    await dialog.getByRole("button", { name: "Move", exact: true }).click();

    await expect(undoToast(page).getByText(/Metric moved to/)).toBeVisible();
    await expect(
      undoToast(page).getByText("First collection", { exact: true }),
    ).toBeVisible();
    await expect(
      MetricPage.header(page).getByText("First collection", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to add a filter to a question that uses a metric", async ({
    page,
    mb,
  }) => {
    const { id: metricId } = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await createQuestionWithMetric(page, mb, metricId, { display: "scalar" });

    await openNotebook(page);
    await filterInNotebook(page);
    const filterPopover = popover(page);
    await filterPopover.getByText("Product", { exact: true }).click();
    await filterPopover.getByText("Category", { exact: true }).click();
    await filterPopover.getByText("Gadget", { exact: true }).click();
    await filterPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await visualize(page);
    await expect(
      page.getByTestId("scalar-container").getByText("4,939", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to add a custom aggregation expression based on a metric", async ({
    page,
    mb,
  }) => {
    const { id: metricId } = await mb.api.createQuestion(
      ORDERS_TIMESERIES_METRIC,
    );
    await createQuestionWithMetric(page, mb, metricId, {
      breakout: MONTH_BREAKOUT,
    });

    await openNotebook(page);
    await getNotebookStep(page, "summarize")
      .getByText(ORDERS_TIMESERIES_METRIC.name, { exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: `[${ORDERS_TIMESERIES_METRIC.name}] * 2`,
      name: "Expression",
    });
    const updateButton = popover(page).getByRole("button", {
      name: "Update",
      exact: true,
    });
    await expect(updateButton).toBeEnabled();
    await updateButton.click();
    await visualize(page);
    await expect(
      echartsContainer(page).getByText("Expression", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to add a breakout to a question that uses a metric", async ({
    page,
    mb,
  }) => {
    const { id: metricId } = await mb.api.createQuestion(
      ORDERS_TIMESERIES_METRIC,
    );
    await createQuestionWithMetric(page, mb, metricId, {
      breakout: MONTH_BREAKOUT,
    });

    await openNotebook(page);
    await getNotebookStep(page, "summarize")
      .getByTestId("breakout-step")
      .getByText("Created At: Month", { exact: true })
      .click();
    const breakoutPopover = popover(page);
    await breakoutPopover.getByText("Product", { exact: true }).click();
    await breakoutPopover.getByText("Category", { exact: true }).click();
    await visualize(page);
    await expect(
      echartsContainer(page).getByText("Product → Category", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to change the temporal unit when consuming a timeseries metric", async ({
    page,
    mb,
  }) => {
    const { id: metricId } = await mb.api.createQuestion(
      ORDERS_TIMESERIES_METRIC,
    );
    await createQuestionWithMetric(page, mb, metricId, {
      breakout: MONTH_BREAKOUT,
    });

    await openNotebook(page);
    await getNotebookStep(page, "summarize")
      .getByTestId("breakout-step")
      .getByText("Created At: Month", { exact: true })
      .click();
    await changeBinningForDimension(page, {
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Year",
    });
    await visualize(page);
    await assertQueryBuilderRowCount(page, 5);
  });

  test("should be able to drill-thru with a metric", async ({ page, mb }) => {
    const { id: metricId } = await mb.api.createQuestion(
      ORDERS_TIMESERIES_METRIC,
    );
    await createQuestionWithMetric(page, mb, metricId, {
      breakout: MONTH_BREAKOUT,
    });

    await cartesianChartCircles(page).nth(23).click({ force: true });
    const drillPopover = popover(page);
    await drillPopover.getByText("Break out by…", { exact: true }).click();
    await drillPopover.getByText("Category", { exact: true }).click();
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await drillPopover.getByText("Source", { exact: true }).click();
    await dataset;
    await expect(
      echartsContainer(page).getByText("User → Source", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to drill-thru with a metric without the aggregation clause", async ({
    page,
    mb,
  }) => {
    const { id: metricId } = await mb.api.createQuestion(
      ORDERS_TIMESERIES_METRIC,
    );
    await createQuestionWithMetric(page, mb, metricId, {
      breakout: MONTH_BREAKOUT,
    });

    await cartesianChartCircles(page).nth(23).click({ force: true });
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await popover(page).getByText("See these Orders", { exact: true }).click();
    await dataset;
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Created At: Month is Mar 1–31, 2027", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 445);
  });

  test("should be able to view a table-based metric without data access", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await mb.signInAsSandboxedUser();
    await visitMetric(page, id);

    await expect(
      page.getByTestId("scalar-container").getByText("18,760", { exact: true }),
    ).toBeVisible();
    const aboutPage = MetricPage.aboutPage(page);
    await expect(
      aboutPage.getByRole("button", { name: /Filter/ }),
    ).toHaveCount(0);
    await expect(
      aboutPage.getByRole("button", { name: /Summarize/ }),
    ).toHaveCount(0);
  });
});

test.describe("metrics", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should bookmark a metric", async ({ page, mb }) => {
    await mb.api.createQuestion({ ...ORDERS_SCALAR_METRIC, name: "Metric Foo" });
    await mb.api.createQuestion({ ...ORDERS_SCALAR_METRIC, name: "Metric Bar" });
    const { id } = await mb.api.createQuestion({
      ...ORDERS_SCALAR_METRIC,
      name: "Metric Baz",
    });
    await visitMetric(page, id);

    await MetricPage.moreMenu(page).click();
    await popover(page).getByText("Bookmark", { exact: true }).click();
    await expect(
      navigationSidebar(page).getByText("Metric Baz", { exact: true }),
    ).toBeVisible();

    await navigationSidebar(page)
      .getByText("Our analytics", { exact: true })
      .click();
    const barEntry = page
      .getByTestId("collection-entry")
      .filter({ hasText: "Metric Bar" });
    await barEntry.hover();
    await icon(barEntry, "ellipsis").click();
    await popover(page).getByText("Bookmark", { exact: true }).click();
    await expectUnstructuredSnowplowEvent(mb, {
      event: "bookmark_added",
      event_detail: "metric",
      triggered_from: "collection_list",
    });

    // The browse-metrics page is backed by the search index, which rebuilds
    // asynchronously after restore() — wait until the metric is indexed.
    await expect
      .poll(
        async () => {
          const response = await mb.api.get(
            "/api/search?models=metric&q=Metric%20Foo",
            { failOnStatusCode: false },
          );
          const body = await response.json().catch(() => ({ data: [] }));
          return (body.data ?? []).length;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    await navigationSidebar(page).getByText("Metrics", { exact: true }).click();
    const fooRow = page.getByRole("row").filter({ hasText: "Metric Foo" });
    await fooRow.hover();
    await icon(fooRow, "ellipsis").click();
    await popover(page).getByText("Bookmark", { exact: true }).click();
    await expectUnstructuredSnowplowEvent(mb, {
      event: "bookmark_added",
      event_detail: "metric",
      triggered_from: "browse_metrics",
    });
  });
});
