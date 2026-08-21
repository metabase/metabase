/**
 * Playwright port of e2e/test/scenarios/metrics/metrics-search.cy.spec.js
 *
 * Finding metrics via global/command-palette search: a saved metric appears in
 * the palette results and on the full search page (where it can be filtered by
 * type = Metric), and clicking it navigates to the metric's About page.
 *
 * Notes:
 * - The upstream `@dataset` / `@metricDataset` intercepts are never awaited by
 *   any test — dropped (PORTING rule 2).
 * - The `@search` intercept is ported via waitForSearch (register-before-
 *   trigger); the test-2 filtered search is awaited around the Apply click, and
 *   the navigation search around "View and filter" inside commandPaletteSearch.
 * - findByRole("option", { name }) / findByText string args are exact matches
 *   in testing-library → { exact: true } (PORTING rule 1).
 */
import { commandPalette } from "../support/command-palette";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { MetricPage, visitMetric } from "../support/metrics";
import { commandPaletteSearch, waitForSearch } from "../support/metrics-search";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

test.describe("scenarios > metrics > search", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to search for metrics in global search", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, ORDERS_SCALAR_METRIC);
    await page.goto("/");
    await commandPaletteSearch(page, ORDERS_SCALAR_METRIC.name, false);
    await commandPalette(page)
      .getByRole("option", { name: ORDERS_SCALAR_METRIC.name, exact: true })
      .click();
    await expect(MetricPage.aboutPage(page)).toBeVisible();
  });

  test("should be able to search for metrics on the search page", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, ORDERS_SCALAR_METRIC);
    await page.goto("/");
    await commandPaletteSearch(page, ORDERS_SCALAR_METRIC.name, true);

    const searchApp = page.getByTestId("search-app");
    await expect(
      searchApp.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
    ).toBeVisible();
    await searchApp.getByTestId("type-search-filter").click();

    await popover(page).getByText("Metric", { exact: true }).click();
    const filterSearch = waitForSearch(page);
    await popover(page).getByText("Apply", { exact: true }).click();
    await filterSearch;

    await expect(searchApp.getByText("1 result", { exact: true })).toBeVisible();
    await searchApp.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }).click();
    await expect(MetricPage.aboutPage(page)).toBeVisible();
  });

  test("should see metrics in recent items in global search", async ({
    page,
    mb,
  }) => {
    const card = await createQuestion(mb.api, ORDERS_SCALAR_METRIC);
    await visitMetric(page, card.id);
    await page.goto("/");
    await commandPaletteSearch(page, ORDERS_SCALAR_METRIC.name, false);
    await commandPalette(page)
      .getByRole("option", { name: ORDERS_SCALAR_METRIC.name, exact: true })
      .click();
    await expect(MetricPage.aboutPage(page)).toBeVisible();
  });
});
