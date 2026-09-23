/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/line_chart.cy.spec.js
 *
 * Notes:
 * - Snowplow helpers (resetSnowplow / enableTracking / expectNoBadSnowplowEvents
 *   / expectUnstructuredSnowplowEvent) run real assertions, backed by the
 *   per-slot collector via ../support/snowplow.
 * - ECharts SVG axis/tick `<text>` carries surrounding whitespace and Playwright's
 *   getByText does not trim, so exact tick/label matches go through
 *   echartsExactText (whitespace-anchored regex). Substring `cy.get("text").contains`
 *   checks stay substring getByText.
 * - The two `cy.get("g.axis.yr").should("not.exist")` assertions are ported
 *   faithfully; post-ECharts there is no `g.axis.yr` element so they pass
 *   vacuously (see findings-inbox/line-chart.md).
 */
import type { Page } from "@playwright/test";

import { chartPathWithFillColor } from "../support/binning";
import {
  echartsContainer,
  leftSidebar,
  openVizSettingsSidebar,
  tooltip,
  trendLine,
} from "../support/charts";
import { openVizTypeSidebar } from "../support/charts-extras";
import { test, expect } from "../support/fixtures";
import {
  brushChart,
  chartSettingSelectValues,
  echartsExactText,
  expectFieldPickerHasGrabber,
  getXYTransform,
  openSeriesSettings,
  triggerMousemove,
  visitLineChartAdhoc,
  visitNativeLineChartAdhoc,
} from "../support/line-chart";
import { splitPanelAxisLines } from "../support/metrics-explorer";
import { cartesianChartCircles } from "../support/metrics";
import { queryBuilderMain } from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { popover } from "../support/ui";
import {
  assertEChartsTooltip,
  cartesianChartCircleWithColor,
  moveDnDKitElementVertically,
} from "../support/viz-charts-repros";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

const testQuery = {
  type: "query" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
  },
  database: SAMPLE_DB_ID,
};

/** cartesianChartCircleWithColor + the Cypress `.should("be.visible")`. */
async function expectCircleWithColorVisible(page: Page, color: string) {
  await expect(
    cartesianChartCircleWithColor(page, color).filter({ visible: true }).first(),
  ).toBeVisible();
}

test.describe("scenarios > visualizations > line chart", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to change y axis position (metabase#13487)", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: testQuery,
      display: "line",
    });

    await openVizSettingsSidebar(page);
    await openSeriesSettings(page, "Count");

    const left = await getXYTransform(echartsExactText(page, "Count").first());

    await popover(page).getByText("Right", { exact: true }).click();

    await expect(async () => {
      const right = await getXYTransform(
        echartsExactText(page, "Count").first(),
      );
      expect(right.y).toBe(left.y);
      expect(right.x).toBeGreaterThan(left.x);
    }).toPass();
  });

  test("should display line settings only for line/area charts", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: testQuery,
      display: "line",
    });

    await openVizSettingsSidebar(page);
    await openSeriesSettings(page, "Count");

    const pop = popover(page);

    // For line chart
    await expect(pop.getByText("Line shape", { exact: true })).toBeAttached();
    await expect(pop.getByText("Line style", { exact: true })).toBeAttached();
    await expect(pop.getByText("Line size", { exact: true })).toBeAttached();
    await expect(
      pop.getByText("Show dots on lines", { exact: true }),
    ).toBeAttached();

    // For area chart
    await pop.locator(".Icon-area").click();
    await expect(pop.getByText("Line shape", { exact: true })).toBeAttached();
    await expect(pop.getByText("Line style", { exact: true })).toBeAttached();
    await expect(pop.getByText("Line size", { exact: true })).toBeAttached();
    await expect(
      pop.getByText("Show dots on lines", { exact: true }),
    ).toBeAttached();

    // For bar chart
    await pop.locator(".Icon-bar").click();
    await expect(pop.getByText("Line shape", { exact: true })).not.toBeVisible();
    await expect(pop.getByText("Line style", { exact: true })).not.toBeVisible();
    await expect(pop.getByText("Line size", { exact: true })).not.toBeVisible();
    await expect(
      pop.getByText("Show dots on lines", { exact: true }),
    ).not.toBeVisible();
  });

  test("should allow changing formatting settings", async ({ page }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: testQuery,
      display: "line",
    });

    await openVizSettingsSidebar(page);
    await openSeriesSettings(page, "Count");

    const pop = popover(page);
    await pop.getByText("Formatting", { exact: true }).click();

    await expect(pop.getByText("Add a prefix", { exact: true })).toBeAttached();
    const prefixInput = pop.getByPlaceholder("$", { exact: true });
    await prefixInput.click();
    await prefixInput.pressSequentially("prefix");
    await prefixInput.blur();

    await expect(echartsExactText(page, "prefix0").first()).toBeVisible();
  });

  test("should reset series settings when switching to line chart", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: testQuery,
      display: "area",
    });

    await openVizSettingsSidebar(page);
    await openSeriesSettings(page, "Count");
    await popover(page).locator(".Icon-bar").click();

    await openVizTypeSidebar(page);
    await page.getByTestId("chart-type-sidebar").locator(".Icon-line").click();

    // should be a line chart
    await expectCircleWithColorVisible(page, "#509EE3");
  });

  test("should reset stacking settings when switching to line chart (metabase#43538)", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        type: "query",
      },
      display: "bar",
      visualization_settings: {
        "stackable.stack_type": "normalized",
      },
    });

    await openVizTypeSidebar(page);
    await page.getByTestId("chart-type-sidebar").locator(".Icon-line").click();

    await expectCircleWithColorVisible(page, "#A989C5");

    // Y-axis scale should not be normalized
    await expect(echartsExactText(page, "100%")).toHaveCount(0);
  });

  test("should be able to format data point values style independently on multi-series chart (metabase#13095)", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.TOTAL, null]],
            [
              "aggregation-options",
              ["/", ["avg", ["field", ORDERS.QUANTITY, null]], 10],
              { "display-name": "AvgPct" },
            ],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.show_values": true,
        column_settings: {
          '["name","expression"]': { number_style: "percent" },
        },
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["sum", "expression"],
      },
    });

    await expect(
      echartsContainer(page).getByText("39.75%").first(),
    ).toBeVisible();
  });

  test("should let unpin y-axis from zero", async ({ page }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg"],
      },
    });

    // The chart is pinned to zero by default: 0 tick should exist
    await expect(echartsExactText(page, "0").first()).toBeVisible();

    await openVizSettingsSidebar(page);
    await page
      .getByTestId("chartsettings-sidebar")
      .getByText("Axes", { exact: true })
      .click();
    await page
      .getByTestId("chartsettings-sidebar")
      .getByText("Unpin from zero", { exact: true })
      .click();

    // Ensure unpinned chart does not have 0 tick
    await expect(echartsExactText(page, "0")).toHaveCount(0);

    await page
      .getByTestId("chartsettings-sidebar")
      .getByText("Unpin from zero", { exact: true })
      .click();

    await expect(echartsExactText(page, "0").first()).toBeVisible();
  });

  test("should display an error message when there are more series than the chart supports", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      display: "line",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.TITLE, null],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "TITLE"],
        "graph.metrics": ["count"],
      },
    });

    await expect(
      page.getByText(
        "This chart type doesn't support more than 100 series of data.",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("should correctly display tooltip values when X-axis is numeric and style is 'Ordinal' (metabase#15998)", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["avg", ["field", ORDERS.QUANTITY, null]],
          ],
          breakout: [
            ["field", PRODUCTS.RATING, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count", "sum", "avg"],
      },
    });

    await cartesianChartCircleWithColor(page, "#509EE3")
      .filter({ visible: true })
      .nth(3)
      .hover({ force: true });
    await assertEChartsTooltip(page, {
      header: "2.7",
      rows: [
        { color: "#509EE3", name: "Count", value: "191" },
        { color: "#88BF4D", name: "Sum of Total", value: "14,747.05" },
        { color: "#A989C5", name: "Average of Quantity", value: "4.3" },
      ],
    });
  });

  test("should be possible to update/change label for an empty row value (metabase#12128)", async ({
    page,
  }) => {
    await visitNativeLineChartAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT '2026-03-01'::date as date, 'cat1' as category, 23 as \"value\"\nUNION ALL\nSELECT '2026-03-01'::date, '', 44\nUNION ALL\nSELECT  '2026-03-01'::date, 'cat3', 58\n\nUNION ALL\n\nSELECT '2026-03-02'::date as date, 'cat1' as category, 20 as \"value\"\nUNION ALL\nSELECT '2026-03-02'::date, '', 50\nUNION ALL\nSELECT  '2026-03-02'::date, 'cat3', 58",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["DATE", "CATEGORY"],
        "graph.metrics": ["VALUE"],
      },
    });

    await openVizSettingsSidebar(page);

    // Make sure we can update input with some existing value
    await openSeriesSettings(page, "cat1", true);
    const cat1Input = popover(page).getByTestId("series-name-input");
    await cat1Input.click();
    await cat1Input.press("End");
    await cat1Input.pressSequentially(" new");
    await cat1Input.blur();
    await expect(cat1Input).toHaveValue("cat1 new");

    // Now do the same for the input with no value
    await openSeriesSettings(page, "(empty)", true);
    const emptyInput = popover(page).getByTestId("series-name-input");
    await emptyInput.click();
    await emptyInput.clear();
    await emptyInput.pressSequentially("cat2");
    await emptyInput.blur();
    await expect(emptyInput).toHaveValue("cat2");

    await page.getByRole("button", { name: "Done", exact: true }).click();

    const legendItems = page.getByTestId("legend-item");
    await expect(
      legendItems.filter({ hasText: "cat1 new" }).first(),
    ).toBeVisible();
    await expect(legendItems.filter({ hasText: "cat2" }).first()).toBeVisible();
    await expect(legendItems.filter({ hasText: "cat3" }).first()).toBeVisible();
  });

  test("should interpolate null value by not rendering a data point (metabase#4122)", async ({
    page,
  }) => {
    await visitNativeLineChartAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query: `
            select 'a' x, 1 y
            union all
            select 'b' x, null y
            union all
            select 'c' x, 2 y
          `,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    await expect(cartesianChartCircles(page).filter({ visible: true })).toHaveCount(
      2,
    );
  });

  test("should show the trend line", async ({ page }) => {
    await visitLineChartAdhoc(page, {
      display: "line",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
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
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.show_trendline": true,
        "graph.show_goal": false,
        "graph.show_values": false,
        "graph.metrics": ["count"],
      },
    });

    await expect(trendLine(page).first()).toBeVisible();
  });

  test("should show label for empty value series breakout (metabase#32107)", async ({
    page,
  }) => {
    await visitNativeLineChartAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query: `
            select 1 id, 50 val1, null val2
            union all select 2, 75, null
            union all select 3, 175, null
            union all select 4, 200, null
            union all select 5, 280, null
          `,
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["ID", "VAL2"],
        "graph.series_order_dimension": null,
        "graph.series_order": null,
        "graph.metrics": ["VAL1"],
      },
    });

    await expect(
      page
        .getByTestId("visualization-root")
        .getByTestId("legend-item")
        .getByText("(empty)", { exact: true }),
    ).toBeVisible();

    await openVizSettingsSidebar(page);
    await expect(
      page
        .getByTestId("chartsettings-sidebar")
        .getByText("(empty)", { exact: true }),
    ).toBeVisible();
  });

  test.describe("y-axis splitting (metabase#12939)", () => {
    test("should not split the y-axis when columns are of the same semantic_type and have close values", async ({
      page,
    }) => {
      await visitLineChartAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["avg", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      await expect(page.locator("g.axis.yr")).toHaveCount(0);
    });

    test("should split the y-axis when columns are of different semantic_type", async ({
      page,
    }) => {
      await visitLineChartAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": PEOPLE_ID,
            aggregation: [
              ["avg", ["field", PEOPLE.LATITUDE, null]],
              ["avg", ["field", PEOPLE.LONGITUDE, null]],
            ],
            breakout: [
              ["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      await expect(
        echartsExactText(page, "Average of Latitude"),
      ).toBeVisible();
      await expect(
        echartsExactText(page, "Average of Longitude"),
      ).toBeVisible();
    });

    test("should split the y-axis when columns are of the same semantic_type but have far values", async ({
      page,
    }) => {
      await visitLineChartAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      await expect(echartsExactText(page, "Sum of Total")).toBeVisible();
      await expect(echartsExactText(page, "Min of Total")).toBeVisible();
    });

    test("should not split the y-axis when the setting is disabled", async ({
      page,
    }) => {
      await visitLineChartAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
        visualization_settings: {
          "graph.y_axis.auto_split": false,
        },
      });

      await expect(page.locator("g.axis.yr")).toHaveCount(0);
    });
  });

  test.describe("color series", () => {
    test("should allow drag and drop", async ({ page }) => {
      const dragQuery = {
        type: "query" as const,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
        },
        database: SAMPLE_DB_ID,
      };

      await visitLineChartAdhoc(page, {
        dataset_query: dragQuery,
        display: "line",
      });

      await openVizSettingsSidebar(page);

      // making sure the grabber icon is there
      await expectFieldPickerHasGrabber(page, "Sum of Total");

      // Drag and drop the first y-axis field to the last position
      const initial = await chartSettingSelectValues(page);

      const dragElement = page
        .getByTestId("chart-settings-widget-graph.metrics")
        .getByTestId("drag-handle")
        .first();
      await moveDnDKitElementVertically(dragElement, 50);

      await expect(async () => {
        const content = await chartSettingSelectValues(page);
        expect(content[0]).toBe(initial[0]); // Created At: Month
        expect(content[1]).toBe(initial[2]); // Sum of Total
        expect(content[2]).toBe(initial[1]); // Count
      }).toPass();
    });

    test("should allow changing a series' color - #53735", async ({ page }) => {
      await visitLineChartAdhoc(page, {
        dataset_query: testQuery,
        display: "line",
      });

      await openVizSettingsSidebar(page);
      await openSeriesSettings(page, "Count");

      await popover(page)
        .getByTestId("color-selector-button")
        .getByRole("button")
        .click();

      await expect(popover(page)).toHaveCount(2);
      await popover(page)
        .last()
        .getByLabel("#EF8C8C", { exact: true })
        .click();

      await page.getByRole("button", { name: "Done", exact: true }).click();

      await expectCircleWithColorVisible(page, "#EF8C8C");
    });
  });

  test.describe("problems with the labels when showing only one row in the results (metabase#12782, metabase#4995)", () => {
    test.beforeEach(async ({ page }) => {
      await visitLineChartAdhoc(page, {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
              ["field", PRODUCTS.CATEGORY, null],
            ],
            filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
          },
          type: "query",
        },
        display: "line",
      });
      await expect(
        page.getByText("Category is Doohickey", { exact: true }),
      ).toBeVisible();
    });

    test("should not drop the chart legend (metabase#4995)", async ({
      page,
    }) => {
      await expect(
        page.getByTestId("legend-item").filter({ hasText: "Doohickey" }).first(),
      ).toBeVisible();

      // Ensure that legend is hidden when not dealing with multi series
      await openVizSettingsSidebar(page);
      await page.getByTestId("remove-CATEGORY").click();
      await expect(queryBuilderMain(page)).not.toContainText("Doohickey");
    });

    test("should display correct axis labels (metabase#12782)", async ({
      page,
    }) => {
      await expect(
        echartsContainer(page).getByText("Created At").first(),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText("Average of Price").first(),
      ).toBeVisible();
    });
  });

  test("should apply brush filters to the series selecting area range when axis is a number", async ({
    page,
  }) => {
    const brushQuery = {
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.QUANTITY]],
      },
      database: SAMPLE_DB_ID,
    };

    await page.setViewportSize({ width: 1280, height: 800 });

    await visitLineChartAdhoc(page, {
      dataset_query: brushQuery,
      display: "line",
    });

    await expect(echartsExactText(page, "Quantity").first()).toBeVisible();
    // wait to avoid grabbing the svg before the chart redraws
    await page.waitForTimeout(100);

    const datasetResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/dataset",
    );
    await brushChart(page, 180, 220, 200);
    await datasetResponse;

    await expect(page.getByTestId("filter-pill")).toContainText(
      "Quantity is between",
    );

    const X_AXIS_VALUE = 8;
    await expect(
      echartsContainer(page).getByText("Quantity").first(),
    ).toBeVisible();
    await expect(
      echartsExactText(page, String(X_AXIS_VALUE)).first(),
    ).toBeVisible();
  });

  test("should format goal tooltip value to match y-axis tick formatting", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.goal_value": 5000,
        "graph.show_goal": true,
        "graph.label_value_formatting": "compact",
        column_settings: {
          '["name","sum"]': {
            number_style: "currency",
            currency: "USD",
          },
        },
      },
    });

    await expect(echartsExactText(page, "$50.0k").first()).toBeVisible();
    await triggerMousemove(echartsExactText(page, "Goal").first());

    await expect(tooltip(page).getByText("Goal:", { exact: true })).toBeVisible();
    await expect(
      tooltip(page).getByText("$5,000.00", { exact: true }),
    ).toBeVisible();
  });

  test("should support formatting goal tooltip value as a percent", async ({
    page,
  }) => {
    await visitLineChartAdhoc(page, {
      dataset_query: testQuery,
      display: "line",
      visualization_settings: {
        "graph.goal_value": 123.4567,
        "graph.show_goal": true,
        "graph.label_value_formatting": "compact",
        column_settings: {
          '["name","count"]': {
            number_style: "percent",
          },
        },
      },
    });

    await expect(echartsExactText(page, "50.0k%").first()).toBeVisible();
    await triggerMousemove(echartsExactText(page, "Goal").first());

    await expect(tooltip(page).getByText("Goal:", { exact: true })).toBeVisible();
    await expect(
      tooltip(page).getByText("12,345.67%", { exact: true }),
    ).toBeVisible();
  });

  test.describe("with tracking", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
      await resetSnowplow(mb);
      await enableTracking(mb);
    });

    test.afterEach(async ({ mb }) => {
      await expectNoBadSnowplowEvents(mb);
    });

    test("should split series into panels and render each series in its own panel", async ({
      mb,
      page,
    }) => {
      await visitLineChartAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["avg", ["field", ORDERS.QUANTITY, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      await expect(page.getByTestId("legend-item")).toHaveCount(2);

      await openVizSettingsSidebar(page);
      await leftSidebar(page).getByText("Display", { exact: true }).click();
      await leftSidebar(page).getByText("Stack series", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(mb, {
        event: "stack_series_enabled",
        triggered_from: "viz_settings",
      });

      await expect(echartsExactText(page, "60,000")).toBeVisible();
      await expect(echartsExactText(page, "8")).toBeVisible();

      await expect(splitPanelAxisLines(page)).toHaveCount(2);

      await expectCircleWithColorVisible(page, "#88BF4D");
      await expectCircleWithColorVisible(page, "#A989C5");

      // Change series color while split panels are active
      await leftSidebar(page).getByText("Data", { exact: true }).click();
      await openSeriesSettings(page, "Sum of Total");

      await popover(page)
        .getByTestId("color-selector-button")
        .getByRole("button")
        .click();

      await expect(popover(page)).toHaveCount(2);
      await popover(page)
        .last()
        .getByLabel("#EF8C8C", { exact: true })
        .click();

      await popover(page).locator(".Icon-bar").click();

      await popover(page).getByText("Formatting", { exact: true }).click();
      const prefixInput = popover(page).getByPlaceholder("$", { exact: true });
      await prefixInput.click();
      await prefixInput.pressSequentially("$");
      await prefixInput.blur();

      await leftSidebar(page)
        .getByRole("button", { name: "Done", exact: true })
        .click();

      await expect(echartsExactText(page, "$60,000")).toBeVisible();

      // Tooltip
      await triggerMousemove(
        cartesianChartCircles(page).filter({ visible: true }).first(),
      );
      await assertEChartsTooltip(page, {
        rows: [
          { name: "Sum of Total", value: "$52.76" },
          { name: "Average of Quantity", value: "2" },
        ],
        blurAfter: true,
      });

      // Brush
      await brushChart(page, 180, 400, 200);

      await expect(
        chartPathWithFillColor(page, "#EF8C8C").first(),
      ).toBeVisible();
      await expectCircleWithColorVisible(page, "#A989C5");
    });
  });
});
