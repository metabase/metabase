/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/trendline.cy.spec.js
 *
 * The Cypress `cy.get("rect")` existence checks are ported as
 * toBeAttached() on the first match — cy.get asserts existence, not
 * visibility.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import {
  leftSidebar,
  openVizSettingsSidebar,
  trendLine,
} from "../support/charts";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

type Harness = {
  restore(): Promise<void>;
  signInAsNormalUser(): Promise<void>;
  api: MetabaseApi;
};

test.describe("scenarios > question > trendline", () => {
  async function setup(
    page: Page,
    mb: Harness,
    questionDetails: Parameters<MetabaseApi["createQuestion"]>[0],
  ) {
    await mb.restore();
    await mb.signInAsNormalUser();
    const { id } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, id);
  }

  test("displays trendline when there are multiple numeric outputs (for simple question) (metabase#12781)", async ({
    page,
    mb,
  }) => {
    await setup(page, mb, {
      name: "12781",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["avg", ["field", ORDERS.SUBTOTAL, null]],
          ["sum", ["field", ORDERS.TOTAL, null]],
        ],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    });

    // Change settings to trendline
    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page).getByText("Trend line", { exact: true }).click();

    // Check graph is still there
    await expect(page.locator("rect").first()).toBeAttached();

    // Remove sum of total
    await leftSidebar(page).getByText("Data", { exact: true }).click();
    await leftSidebar(page)
      .locator(".Icon-close")
      .last()
      .click({ force: true });
    await leftSidebar(page).getByText("Done", { exact: true }).click();

    // Graph should still exist
    await expect(
      page.getByPlaceholder("Created At", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("rect").first()).toBeAttached();
  });

  test("should handle per-series trend line settings", async ({
    page,
    mb,
  }) => {
    await setup(page, mb, {
      name: "Per-series trend line settings",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["avg", ["field", ORDERS.SUBTOTAL, null]],
          ["sum", ["field", ORDERS.TOTAL, null]],
        ],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    });
    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page).getByText("Trend line", { exact: true }).click();
    await expect(trendLine(page)).toHaveCount(2);

    await leftSidebar(page).getByText("Data", { exact: true }).click();
    await leftSidebar(page).getByTestId("settings-avg").click();
    await popover(page)
      .getByText("Show trend line for this series", { exact: true })
      .click();
    await expect(trendLine(page)).toHaveCount(1);
  });

  test("should display trend line for stack-100% chart (metabase#25614)", async ({
    page,
    mb,
  }) => {
    await setup(page, mb, {
      name: "25614",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"], ["avg", ["field", PRODUCTS.PRICE, null]]],
        breakout: [
          ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
        ],
      },
      display: "bar",
    });
    await openVizSettingsSidebar(page);
    // stack 100%, then enable trend line
    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page).getByText("Stack - 100%", { exact: true }).click();
    await leftSidebar(page).getByText("Trend line", { exact: true }).click();
    // ensure that two trend lines are present
    await expect(trendLine(page)).toHaveCount(2);
  });
});
