/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/treemap.cy.spec.ts
 *
 * The Cypress `should("contain", ...)` text checks on the echarts container
 * are case-sensitive substring matches → case-sensitive regexes here.
 * The drill-through @dataset wait is registered at its true trigger (the
 * "See these Orders" click), not at the tile click where Cypress parked
 * the intercept.
 */
import type { Locator, Page } from "@playwright/test";

import { echartsContainer, openVizSettingsSidebar } from "../support/charts";
import {
  openVizTypeSidebar,
  visitNativeQuestionAdhoc,
} from "../support/charts-extras";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { test, expect } from "../support/fixtures";
import { waitForDataset } from "../support/nested-questions";
import { visitQuestionAdhoc } from "../support/permissions";
import { checkSavedToCollectionQuestionToast } from "../support/question-new";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const TREEMAP_QUERY = `
SELECT 'Legumes' AS category, 'Chickpeas' AS item, 50 AS sales
UNION ALL SELECT 'Legumes', 'Lentils', 40
UNION ALL SELECT 'Legumes', 'Black Beans', 30
UNION ALL SELECT 'Grains', 'Quinoa', 35
UNION ALL SELECT 'Grains', 'Brown Rice', 45
UNION ALL SELECT 'Nuts', 'Almonds', 40
UNION ALL SELECT 'Nuts', 'Walnuts', 35;
`;

function treemapBreadcrumb(page: Page): Locator {
  return page.getByTestId("treemap-breadcrumb");
}

test.describe("scenarios > visualizations > treemap", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should render and configure a treemap in the query builder", async ({
    page,
  }) => {
    await visitNativeQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        type: "native",
        native: { query: TREEMAP_QUERY },
        database: SAMPLE_DB_ID,
      },
    });

    // Switch to the Treemap visualization
    await openVizTypeSidebar(page);
    await page.getByTestId("Treemap-button").click();

    // Top-level groups and leaf tiles render
    await expect(echartsContainer(page)).toContainText(/Legumes/);
    await expect(echartsContainer(page)).toContainText(/Grains/);
    await expect(echartsContainer(page)).toContainText(/Nuts/);
    await expect(echartsContainer(page)).toContainText(/Chickpeas/);

    // Toggle leaf labels off and on
    await openVizSettingsSidebar(page);
    const settingsSidebar = page.getByTestId("chartsettings-sidebar");
    await settingsSidebar.getByText("Display", { exact: true }).click();

    await settingsSidebar.getByText("Show leaf labels", { exact: true }).click();

    await expect(echartsContainer(page)).toContainText(/Legumes/);
    await expect(echartsContainer(page)).not.toContainText(/Chickpeas/);

    await settingsSidebar.getByText("Show leaf labels", { exact: true }).click();
    await expect(echartsContainer(page)).toContainText(/Chickpeas/);

    // Saving the question works
    await page.getByTestId("qb-save-button").click();
    await page
      .getByPlaceholder("What is the name of your question?", { exact: true })
      .fill("My Treemap");
    await page
      .getByTestId("save-question-modal")
      .getByText("Save", { exact: true })
      .click();
    await checkSavedToCollectionQuestionToast(page);
  });

  test("should drill into a group and navigate back via the breadcrumb", async ({
    page,
  }) => {
    await visitNativeQuestionAdhoc(page, {
      display: "treemap",
      dataset_query: {
        type: "native",
        native: { query: TREEMAP_QUERY },
        database: SAMPLE_DB_ID,
      },
    });

    // Overview breadcrumb shows the grand total
    await expect(treemapBreadcrumb(page)).toContainText(/Total/);
    await expect(echartsContainer(page)).toContainText(/Legumes/);
    await expect(echartsContainer(page)).toContainText(/Grains/);
    await expect(echartsContainer(page)).toContainText(/Nuts/);

    // Clicking a group drills into it
    await echartsContainer(page).getByText("Legumes", { exact: true }).click();

    await expect(
      treemapBreadcrumb(page).getByRole("button", {
        name: "Legumes",
        exact: true,
      }),
    ).toBeVisible();
    await expect(echartsContainer(page)).toContainText(/Chickpeas/);
    await expect(echartsContainer(page)).toContainText(/Lentils/);
    await expect(echartsContainer(page)).not.toContainText(/Quinoa/);

    // Back button returns to the overview
    await treemapBreadcrumb(page)
      .getByRole("button", { name: "Legumes", exact: true })
      .click();

    await expect(treemapBreadcrumb(page)).toContainText(/Total/);
    await expect(echartsContainer(page)).toContainText(/Grains/);
    await expect(echartsContainer(page)).toContainText(/Nuts/);
  });

  test("should drill through from a tile", async ({ page }) => {
    await visitQuestionAdhoc(page, {
      display: "treemap",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
      },
    });

    // One-level treemap renders the category tiles
    await expect(echartsContainer(page)).toContainText(/Doohickey/);
    await expect(echartsContainer(page)).toContainText(/Widget/);

    // Clicking a tile drills through to a filtered view
    await echartsContainer(page)
      .getByText("Doohickey", { exact: true })
      .click();
    const datasetResponse = waitForDataset(page);
    await popover(page).getByText("See these Orders", { exact: true }).click();

    await datasetResponse;
    await expect(
      queryBuilderFiltersPanel(page).getByText(
        "Product → Category is Doohickey",
        { exact: true },
      ),
    ).toBeVisible();
  });
});
