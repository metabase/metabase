/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/bar_chart.cy.spec.js
 *
 * New helpers (getValueLabels / otherSeriesChartPaths / expectChartPathVisible)
 * live in support/bar-chart.ts; everything else is imported read-only from the
 * shared modules.
 *
 * Mapping notes:
 * - `H.visitQuestionAdhoc` on a native query → visitNativeAdhoc (visitAdhoc's
 *   native branch throws — native queries are not autorun from the hash).
 * - `H.chartPathWithFillColor` / `echartsText` come from legend.ts (scoped);
 *   ECharts axis `<text>` carries whitespace padding testing-library trims but
 *   Playwright's getByText does not, so axis-label lookups use echartsText's
 *   whitespace-tolerant exact regex.
 * - `.should("be.visible")` on a multi-path color set is ANY-of (rule 3) →
 *   expectChartPathVisible (`.filter({visible:true}).first()`).
 * - `.trigger("mousemove")` → triggerMousemove (synthetic dispatch);
 *   `.realHover()` → hover().
 * - `H.moveDnDKitElementByAlias(alias, { vertical, useMouseEvents: true })` →
 *   moveDnDKitElementVertically (the synthetic MouseEvent sequence).
 * - `cy.wait("@dataset")` calls that only reconfirm the visit's own dataset
 *   response (metabase#60475 / #68048) are dropped — visitAdhoc /
 *   visitNativeAdhoc already await it.
 * - The @skip test is ported faithfully as test.skip (upstream `{ tags:
 *   "@skip" }`).
 */
import {
  createDashboardWithQuestions,
  createNativeQuestion,
  createQuestion,
} from "../support/factories";
import {
  echartsContainer,
  leftSidebar,
  openVizSettingsSidebar,
  tooltip,
} from "../support/charts";
import { createQuestionAndAddToDashboard } from "../support/dashboard-card-repros";
import { getDraggableElements } from "../support/charts-extras";
import { sidebar } from "../support/dashboard";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { selectFilterOperator } from "../support/joins";
import { chartPathWithFillColor, echartsText } from "../support/legend";
import { triggerMousemove } from "../support/line-chart";
import { openNotebook, queryBuilderMain } from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  icon,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import {
  assertEChartsTooltip,
  echartsTooltip,
  echartsTriggerBlur,
  moveDnDKitElementVertically,
  visitAdhoc,
  visitNativeAdhoc,
} from "../support/viz-charts-repros";
import {
  expectChartPathVisible,
  getValueLabels,
  otherSeriesChartPaths,
} from "../support/bar-chart";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const breakoutBarChart = {
  display: "bar",
  dataset_query: {
    type: "query" as const,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    },
    database: SAMPLE_DB_ID,
  },
};

test.describe("scenarios > visualizations > bar chart", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("with numeric dimension", () => {
    const query = `
      select null as "a", 10 as "b" union all
      select 5 as "a", 2 as "b" union all
      select 0 as "a", 1 as "b"
    `;

    function getQuestion(visualizationSettings: Record<string, unknown>) {
      return {
        dataset_query: {
          type: "native" as const,
          native: { query, "template-tags": {} },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: visualizationSettings,
      };
    }

    test("should not show a bar for null values (metabase#12138)", async ({
      page,
    }) => {
      await visitNativeAdhoc(
        page,
        getQuestion({
          "graph.dimensions": ["a"],
          "graph.metrics": ["b"],
        }),
      );

      await expect(echartsText(page, "(empty)")).toHaveCount(0);
    });

    test("should show an (empty) bar for null values when X axis is ordinal (metabase#12138)", async ({
      page,
    }) => {
      await visitNativeAdhoc(
        page,
        getQuestion({
          "graph.dimensions": ["a"],
          "graph.metrics": ["b"],
          "graph.x_axis.scale": "ordinal",
        }),
      );

      await expect(echartsText(page, "(empty)").first()).toBeVisible();
    });
  });

  test.describe("with binned dimension (histogram)", () => {
    test("should filter out null values (metabase#16049)", async ({ page }) => {
      await visitAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.DISCOUNT, { binning: { strategy: "default" } }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
      });

      // there are six bars when null isn't filtered
      await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(5);
      // correct data has this on the y-axis
      await expect(echartsText(page, "1,800").first()).toBeVisible();
      // If nulls are included the y-axis stretches much higher
      await expect(echartsText(page, "16,000")).toHaveCount(0);
    });
  });

  test.describe("with very low and high values", () => {
    test("should display correct data values", async ({ page }) => {
      await visitNativeAdhoc(page, {
        display: "bar",
        dataset_query: {
          type: "native",
          native: {
            query:
              "select '2027-01-01' as x_axis_1, 'A' as x_axis_2, 20000000 as y_axis\n" +
              "union all\n" +
              "select '2027-01-02' as x_axis_1, 'A' as x_axis_2, 19 as y_axis\n" +
              "union all\n" +
              "select '2027-01-03' as x_axis_1, 'A' as x_axis_2, 20000000 as y_axis\n",
          },
          database: SAMPLE_DB_ID,
        },
        visualization_settings: {
          "graph.show_values": true,
          "graph.dimensions": ["X_AXIS_1", "X_AXIS_2"],
          "graph.metrics": ["Y_AXIS"],
        },
      });

      // `H.echartsContainer().get("text")` is really unscoped `cy.get("text")`
      // (.get() drops the previous subject); .should("contain", …) is any-of.
      const texts = echartsContainer(page).locator("text");
      await expect(texts.filter({ hasText: "19" }).first()).toBeVisible();
      await expect(texts.filter({ hasText: "20.0M" }).first()).toBeVisible();
    });
  });

  test.describe("with x-axis series", () => {
    test.beforeEach(async ({ page }) => {
      await visitAdhoc(page, breakoutBarChart);

      await openVizSettingsSidebar(page);
      await sidebar(page).getByText("Data", { exact: true }).click();
    });

    test("should allow you to show/hide and reorder columns", async ({
      page,
    }) => {
      await moveDnDKitElementVertically(getDraggableElements(page).nth(0), 100);

      await expect(page.getByTestId("legend-item").nth(0)).toContainText(
        "Gadget",
      );
      await expect(page.getByTestId("legend-item").nth(1)).toContainText(
        "Gizmo",
      );
      await expect(page.getByTestId("legend-item").nth(2)).toContainText(
        "Doohickey",
      );
      await expect(page.getByTestId("legend-item").nth(3)).toContainText(
        "Widget",
      );

      // Hide Gizmo
      await icon(getDraggableElements(page).nth(1), "close").click({
        force: true,
      });

      await expect(
        page
          .getByTestId("query-visualization-root")
          .getByText("Gizmo", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByTestId("legend-item")).toHaveCount(3);
      await expectChartPathVisible(page, "#F2A86F");
      await expectChartPathVisible(page, "#F9D45C");
      await expectChartPathVisible(page, "#88BF4D");

      await leftSidebar(page)
        .getByRole("button", { name: "Add another series", exact: true })
        .click();
      await popover(page).getByText("Gizmo", { exact: true }).click();

      await expect(
        page
          .getByTestId("query-visualization-root")
          .getByText("Gizmo", { exact: true })
          .first(),
      ).toBeVisible();
      await expect(page.getByTestId("legend-item")).toHaveCount(4);
      await expectChartPathVisible(page, "#F2A86F");
      await expectChartPathVisible(page, "#F9D45C");
      await expectChartPathVisible(page, "#88BF4D");
      await expectChartPathVisible(page, "#A989C5");

      await page
        .getByTestId("legend-item")
        .filter({ hasText: /Gadget/ })
        .first()
        .click();
      await popover(page).getByText("See these Orders", { exact: true }).click();
      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("Product → Category is Gadget", { exact: true }),
      ).toBeVisible();
    });

    test("should gracefully handle removing filtered items, and adding new items to the end of the list", async ({
      page,
    }) => {
      await moveDnDKitElementVertically(getDraggableElements(page).first(), 100);

      // Hide Gizmo
      await icon(getDraggableElements(page).nth(1), "close").click({
        force: true,
      });

      await queryBuilderHeader(page)
        .getByRole("button", { name: /Filter/ })
        .click();
      await popover(page).getByText("Product", { exact: true }).click();
      await popover(page).getByText("Category", { exact: true }).click();
      await selectFilterOperator(page, "Is not");
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();

      await expect(getDraggableElements(page)).toHaveCount(2);
      await expect(getDraggableElements(page).nth(0)).toHaveText("Doohickey");
      await expect(getDraggableElements(page).nth(1)).toHaveText("Widget");

      await icon(page.getByTestId("qb-filters-panel"), "close").first().click();

      await expect(getDraggableElements(page)).toHaveCount(3);
      await expect(getDraggableElements(page).nth(0)).toHaveText("Gadget");
      await expect(getDraggableElements(page).nth(1)).toHaveText("Doohickey");
      await expect(getDraggableElements(page).nth(2)).toHaveText("Widget");

      await leftSidebar(page)
        .getByRole("button", { name: "Add another series", exact: true })
        .click();
      await popover(page).getByText("Gizmo", { exact: true }).click();

      await expect(getDraggableElements(page)).toHaveCount(4);
      await expect(getDraggableElements(page).nth(0)).toHaveText("Gadget");
      await expect(getDraggableElements(page).nth(1)).toHaveText("Gizmo");
      await expect(getDraggableElements(page).nth(2)).toHaveText("Doohickey");
      await expect(getDraggableElements(page).nth(3)).toHaveText("Widget");
    });
  });

  // Note (EmmadUsmani): see `line_chart.cy.spec.js` for more test cases of this
  test.describe("with split y-axis (metabase#12939)", () => {
    test("should split the y-axis when column settings differ", async ({
      page,
    }) => {
      await visitAdhoc(page, {
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
        display: "bar",
        visualization_settings: {
          column_settings: {
            '["name","avg"]': { number_style: "decimal" },
            '["name","min"]': { number_style: "percent" },
          },
        },
      });

      const texts = echartsContainer(page).locator("text");
      await expect(
        texts.filter({ hasText: /Average of Total/ }).first(),
      ).toBeVisible();
      await expect(
        texts.filter({ hasText: /Min of Total/ }).first(),
      ).toBeVisible();
    });

    test("should not split the y-axis when semantic_type, column settings are same and values are not far", async ({
      page,
    }) => {
      await visitAdhoc(page, {
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
        display: "bar",
      });

      await expect(page.locator("g.axis.yr")).toHaveCount(0);
    });

    test("should split the y-axis on native queries with two numeric columns", async ({
      page,
    }) => {
      await visitNativeAdhoc(page, {
        display: "bar",
        dataset_query: {
          type: "native",
          native: {
            query:
              'SELECT products.category AS "x", COUNT(*) AS "m1", AVG(orders.discount) AS "m2" ' +
              "FROM orders " +
              "JOIN products ON orders.product_id = products.id " +
              "GROUP BY products.category",
          },
          database: SAMPLE_DB_ID,
        },
        visualization_settings: {
          "graph.dimensions": ["x"],
          "graph.metrics": ["m1", "m2"],
        },
      });

      const texts = echartsContainer(page).locator("text");
      await expect(texts.filter({ hasText: /m1/ }).first()).toBeVisible();
      await expect(texts.filter({ hasText: /m2/ }).first()).toBeVisible();
    });
  });

  test.describe("with stacked bars", () => {
    for (const devMode of [false, true]) {
      test(`should drill-through correctly when stacking - development-mode: ${devMode}`, async ({
        page,
      }) => {
        await page.route("**/api/session/properties", async (route) => {
          const response = await route.fetch();
          const json = await response.json();
          if (json["token-features"]) {
            json["token-features"].development_mode = devMode;
          }
          await route.fulfill({ response, json });
        });

        await visitAdhoc(page, {
          dataset_query: {
            database: SAMPLE_DB_ID,
            type: "query",
            query: {
              "source-table": PRODUCTS_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", PRODUCTS.CATEGORY],
                ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
              ],
            },
          },
          display: "bar",
          visualization_settings: { "stackable.stack_type": "stacked" },
        });

        await page
          .getByTestId("legend-item")
          .getByText("Doohickey", { exact: true })
          .click();
        await page.getByText("See these Products", { exact: true }).click();

        await expect(
          page.getByText("Category is Doohickey", { exact: true }),
        ).toBeVisible();
      });
    }
  });

  test("supports gray series colors", async ({ page }) => {
    const grayColor = "#F2F2F3";

    await visitAdhoc(page, {
      ...breakoutBarChart,
      visualization_settings: {
        "graph.dimensions": ["CATEGORY", "SOURCE"],
        "graph.metrics": ["count"],
      },
    });

    // Ensure the gray color did not get assigned to series
    await expect(chartPathWithFillColor(page, grayColor)).toHaveCount(0);

    await openVizSettingsSidebar(page);

    // Open color picker for the first series
    await page.getByLabel("#88BF4D", { exact: true }).click();

    // Assign gray color to the first series
    await page.getByLabel(grayColor, { exact: true }).click();

    await expectChartPathVisible(page, grayColor);
  });

  test("supports up to 100 series (metabase#28796)", async ({ page }) => {
    await visitAdhoc(page, {
      display: "bar",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["and", ["<", ["field", ORDERS.ID, null], 101]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", ORDERS.ID],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "SUBTOTAL"],
        "graph.metrics": ["count"],
      },
    });

    await openVizSettingsSidebar(page);
    await leftSidebar(page)
      .getByRole("button", { name: "90 more series", exact: true })
      .click();
    await expect(page.locator("[data-testid^=draggable-item]")).toHaveCount(100);

    await page
      .getByTestId("qb-filters-panel")
      .getByText("ID is less than 101", { exact: true })
      .click();
    // cy.type("{backspace}2") on "101": the caret sits at the end (press End
    // first — PORTING wave-12 gotcha), backspace deletes the trailing "1" →
    // "10", then "2" → "102".
    const filterInput = await findByDisplayValue(popover(page), "101");
    await filterInput.click();
    await filterInput.press("End");
    await filterInput.press("Backspace");
    await filterInput.pressSequentially("2");
    await popover(page)
      .getByRole("button", { name: "Update filter", exact: true })
      .click();

    await expect(
      queryBuilderMain(page).getByText(
        "This chart type doesn't support more than 100 series of data.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator("[data-testid^=draggable-item]")).toHaveCount(0);
  });

  test("should support showing data points with > 10 series (#33725)", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    const stateFilter = [
      "=",
      ["field", PEOPLE.STATE, {}],
      "AK",
      "AL",
      "AR",
      "AZ",
      "CA",
      "CO",
      "CT",
      "FL",
      "GA",
      "IA",
    ];

    const dateFilter = [
      "between",
      [
        "field",
        ORDERS.CREATED_AT,
        {
          "base-type": "type/DateTime",
        },
      ],
      "2026-09-01",
      "2026-09-30",
    ];

    const avgTotalByMonth = {
      name: "Average Total by Month",
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["avg", ["field", ORDERS.TOTAL]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "line",
    };

    const sumTotalByMonth = {
      name: "Sum Total by Month",
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "line",
    };

    const multiMetric = {
      name: "Should split",
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["avg", ["field", ORDERS.TAX]],
          ["sum", ["field", ORDERS.TAX]],
          ["min", ["field", ORDERS.TAX]],
          ["max", ["field", ORDERS.TAX]],
          ["avg", ["field", ORDERS.SUBTOTAL]],
          ["sum", ["field", ORDERS.SUBTOTAL]],
          ["min", ["field", ORDERS.SUBTOTAL]],
          ["max", ["field", ORDERS.SUBTOTAL]],
          ["avg", ["field", ORDERS.TOTAL]],
          ["sum", ["field", ORDERS.TOTAL]],
          ["min", ["field", ORDERS.TOTAL]],
          ["max", ["field", ORDERS.TOTAL]],
        ],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        filter: dateFilter,
      },
      display: "bar",
      visualization_settings: {
        "graph.show_values": true,
      },
    };

    const breakoutQuestion = {
      name: "Should not Split",
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
        ],
        filter: ["and", stateFilter, dateFilter],
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "STATE"],
        "graph.metrics": ["count"],
        "graph.show_values": true,
      },
    };

    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      dashboardName: "Split Test Dashboard",
      questions: [multiMetric],
    });
    const { id: questionId } = await createQuestion(mb.api, sumTotalByMonth);
    // H.cypressWaitAll runs both through the serial command queue; run them
    // sequentially so each re-reads the dashboard and keeps the other's card.
    await createQuestionAndAddToDashboard(mb.api, avgTotalByMonth, dashboard.id, {
      series: [{ id: questionId }],
      col: 12,
      row: 0,
      visualization_settings: {
        "card.title": "Multi Series",
      },
    });
    await createQuestionAndAddToDashboard(
      mb.api,
      breakoutQuestion,
      dashboard.id,
      { col: 0, row: 9, size_x: 20 },
    );
    await visitDashboard(page, mb.api, dashboard.id);

    // This card is testing #33725 now, as the changes made for #34618 would
    // cause "Should not Split" to no longer split and error
    const shouldSplit = page
      .getByTestId("dashcard")
      .filter({ hasText: /Should split/ });
    // Verify this axis tick exists twice which verifies there are two y-axes
    await expect(echartsText(shouldSplit, "3.0k")).toHaveCount(2);

    const multiSeries = page
      .getByTestId("dashcard")
      .filter({ hasText: /Multi Series/ });
    await expect(
      echartsText(multiSeries, "Average Total by Month").first(),
    ).toBeVisible();
    await expect(
      echartsText(multiSeries, "Sum Total by Month").first(),
    ).toBeVisible();

    // Should not produce a split axis graph (#34618)
    const shouldNotSplit = page
      .getByTestId("dashcard")
      .filter({ hasText: /Should not Split/ });
    const valueLabels = getValueLabels(shouldNotSplit);
    for (const value of ["6", "13", "19"]) {
      await expect(valueLabels.filter({ hasText: value }).first()).toBeVisible();
    }
    await expect(shouldNotSplit.locator(".axis.yr")).toHaveCount(0);
  });

  test("should correctly handle bar sizes and tool-tips for multiple y-axis metrics with column scaling  (#43536)", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();

    const column_settings = { '["name","sum"]': { scale: 0.5 } };
    const multiMetric = {
      name: "Should split",
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["sum", ["field", ORDERS.TOTAL]],
          ["sum", ["field", ORDERS.TOTAL]],
        ],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "bar",
      visualization_settings: {
        column_settings,
        "graph.show_values": true,
        "graph.stackable.stack_type": "stacked",
        series_settings: {
          sum_2: {
            axis: "left",
          },
          sum: {
            axis: "left",
          },
        },
      },
    };

    const { id } = await createQuestion(mb.api, multiMetric);
    await visitQuestion(page, id);

    const firstMetric = chartPathWithFillColor(page, "#88BF4D").first();
    const secondMetric = chartPathWithFillColor(page, "#98D9D9").first();
    const boxOne = await firstMetric.boundingBox();
    const boxTwo = await secondMetric.boundingBox();
    expect(boxOne).not.toBeNull();
    expect(boxTwo).not.toBeNull();

    // since the first metric is scaled to be half of the second metric
    // the first bar should be half the size of the first bar
    // within a given tolerance
    expect(boxOne!.height - boxTwo!.height / 2).toBeLessThan(0.1);

    await chartPathWithFillColor(page, "#88BF4D").first().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        {
          color: "#88BF4D",
          name: "Sum of Total",
          value: "21,078.43",
          index: 0,
        },
        {
          color: "#98D9D9",
          name: "Sum of Total",
          value: "42,156.87",
          index: 1,
        },
      ],
    });
  });

  test("should correctly show tool-tips when stacked bar charts contain a total value that is negative (#39012)", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();

    const { id: negativeTotalCardId } = await createNativeQuestion(mb.api, {
      name: "42948",
      native: {
        query:
          "    SELECT DATE '2024-05-21' AS created_at, 'blue' AS category, -7 as v\nUNION ALL SELECT DATE '2024-05-21' , 'yellow', 5\nUNION ALL SELECT DATE '2024-05-20' , 'blue', -16\nUNION ALL SELECT DATE '2024-05-20' , 'yellow', 8\nUNION ALL SELECT DATE '2024-05-19' ,'blue', 2\nUNION ALL SELECT DATE '2024-05-19' ,'yellow', 8\nUNION ALL SELECT DATE '2024-05-22' ,'blue', 2\nUNION ALL SELECT DATE '2024-05-22' ,'yellow', -2\nUNION ALL SELECT DATE '2024-05-23' ,'blue', 3\nUNION ALL SELECT DATE '2024-05-23' ,'yellow', -2\nORDER BY created_at",
      },

      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["V"],
        "stackable.stack_type": "stacked",
      },
    });
    await visitQuestion(page, negativeTotalCardId);

    await chartPathWithFillColor(page, "#A989C5").nth(0).hover();
    await assertEChartsTooltip(page, {
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "2",
          secondaryValue: "20.00 %",
        },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "8",
          secondaryValue: "80.00 %",
        },
        {
          name: "Total",
          value: "10",
          secondaryValue: "100 %",
        },
      ],
    });
    await echartsTriggerBlur(page);

    await chartPathWithFillColor(page, "#A989C5").nth(1).hover();
    await assertEChartsTooltip(page, {
      rows: [
        {
          color: "#F9D45C",
          name: "yellow",
          value: "8",
          secondaryValue: "100 %",
        },
        { name: "Total positive", value: "8" },
        {
          color: "#A989C5",
          name: "blue",
          value: "-16",
          secondaryValue: "-100 %",
        },
        { name: "Total negative", value: "-16" },
        { name: "Total", value: "-8" },
      ],
    });
    await echartsTriggerBlur(page);

    await chartPathWithFillColor(page, "#A989C5").nth(2).hover();
    await assertEChartsTooltip(page, {
      rows: [
        {
          color: "#F9D45C",
          name: "yellow",
          value: "5",
          secondaryValue: "100 %",
        },
        { name: "Total positive", value: "5" },
        {
          color: "#A989C5",
          name: "blue",
          value: "-7",
          secondaryValue: "-100 %",
        },
        { name: "Total negative", value: "-7" },
        { name: "Total", value: "-2" },
      ],
    });
    await echartsTriggerBlur(page);

    await chartPathWithFillColor(page, "#A989C5").nth(3).hover();
    await assertEChartsTooltip(page, {
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "2",
          secondaryValue: "100 %",
        },
        { name: "Total positive", value: "2" },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "-2",
          secondaryValue: "-100 %",
        },
        { name: "Total negative", value: "-2" },
        { name: "Total", value: "0" },
      ],
    });
    await echartsTriggerBlur(page);

    await chartPathWithFillColor(page, "#A989C5").nth(4).hover();
    await assertEChartsTooltip(page, {
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "3",
          secondaryValue: "100 %",
        },
        { name: "Total positive", value: "3" },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "-2",
          secondaryValue: "-100 %",
        },
        { name: "Total negative", value: "-2" },
        { name: "Total", value: "1" },
      ],
    });
    await echartsTriggerBlur(page);
  });

  test("should correctly show tool-tips when stacked bar charts contain multiple positive and multiple negative segments (#47596)", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();

    const { id: multiSegmentCardId } = await createNativeQuestion(mb.api, {
      name: "47596",
      native: {
        query: `${[
          "select date '2024-05-21' AS created_at, 'cat1' AS category, 2 as v",
          "select date '2024-05-21', 'cat2', -1",
          "select date '2024-05-21', 'cat3', 1",
          "select date '2024-05-21', 'cat4', -1",
        ].join(" union all ")} order by created_at`,
      },

      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["V"],
        "stackable.stack_type": "stacked",
      },
    });
    await visitQuestion(page, multiSegmentCardId);

    await chartPathWithFillColor(page, "#F9D45C").nth(0).hover();
    await assertEChartsTooltip(page, {
      rows: [
        {
          color: "#EF8C8C",
          name: "cat1",
          value: "2",
          secondaryValue: "66.67 %",
        },
        {
          color: "#F2A86F",
          name: "cat3",
          value: "1",
          secondaryValue: "33.33 %",
        },
        { name: "Total positive", value: "3" },
        {
          color: "#98D9D9",
          name: "cat4",
          value: "-1",
          secondaryValue: "-50.00 %",
        },
        {
          color: "#F9D45C",
          name: "cat2",
          value: "-1",
          secondaryValue: "-50.00 %",
        },
        { name: "Total negative", value: "-2" },
        { name: "Total", value: "1" },
      ],
    });
    await echartsTriggerBlur(page);
  });

  // Upstream tags this `@skip` (never runs in CI); ported faithfully as
  // test.skip so it is not made to pass (GATE: has-skips).
  test.skip("should allow grouping series into a single 'Other' series", async ({
    page,
  }) => {
    const AK_SERIES_COLOR = "#509EE3";

    const USER_STATE_FIELD_REF = [
      "field",
      PEOPLE.STATE,
      { "source-field": ORDERS.USER_ID },
    ];
    const ORDER_CREATED_AT_FIELD_REF = [
      "field",
      ORDERS.CREATED_AT,
      { "temporal-unit": "month" },
    ];

    async function setMaxCategories(
      value: number,
      { viaBreakoutSettings = false }: { viaBreakoutSettings?: boolean } = {},
    ) {
      if (viaBreakoutSettings) {
        await leftSidebar(page).getByTestId("settings-STATE").click();
      } else {
        await leftSidebar(page)
          .getByLabel("Other series settings", { exact: true })
          .click();
      }
      const input = popover(page).getByTestId("graph-max-categories-input");
      await input.click();
      await input.press("ControlOrMeta+a");
      await input.pressSequentially(String(value));
      await input.blur();
      await page.waitForTimeout(500); // wait for viz to re-render
    }

    async function setOtherCategoryAggregationFn(fnName: string) {
      await leftSidebar(page)
        .getByLabel("Other series settings", { exact: true })
        .click();
      await popover(page)
        .getByTestId("graph-other-category-aggregation-fn-picker")
        .click();
      await popover(page).last().getByText(fnName, { exact: true }).click();
    }

    await visitAdhoc(page, {
      display: "bar",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [USER_STATE_FIELD_REF, ORDER_CREATED_AT_FIELD_REF],
          filter: [
            "and",
            [
              "between",
              ORDER_CREATED_AT_FIELD_REF,
              "2025-09-01T00:00Z",
              "2026-02-01T00:00Z",
            ],
            [
              "=",
              USER_STATE_FIELD_REF,
              "AK",
              "AL",
              "AR",
              "AZ",
              "CA",
              "CO",
              "CT",
              "DE",
              "FL",
              "GA",
              "IA",
              "ID",
              "IL",
              "KY",
            ],
          ],
        },
      },
    });

    // Enable 'Other' series
    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByTestId("settings-STATE").click();
    await popover(page)
      .getByLabel("Enforce maximum number of series", { exact: true })
      .click();

    // Test 'Other' series renders
    await expect(otherSeriesChartPaths(page)).toHaveCount(6);

    // Test drill-through is disabled for 'Other' series
    await otherSeriesChartPaths(page).first().click();
    await expect(page.getByTestId("click-actions-view")).toHaveCount(0);

    // Test drill-through is enabled for regular series
    await chartPathWithFillColor(page, AK_SERIES_COLOR).first().click();
    await expect(page.getByTestId("click-actions-view")).toBeVisible();

    // Test legend and series visibility toggling
    const otherSeriesLegendItem = queryBuilderMain(page)
      .getByTestId("legend-item")
      .last();
    await expect(queryBuilderMain(page).getByTestId("legend-item")).toHaveCount(
      9,
    );
    await otherSeriesLegendItem
      .getByLabel("Hide series", { exact: true })
      .click();
    await expect(otherSeriesChartPaths(page)).toHaveCount(0);
    await otherSeriesLegendItem
      .getByLabel("Show series", { exact: true })
      .click();
    await expect(otherSeriesChartPaths(page)).toHaveCount(6);

    // Test tooltips
    await chartPathWithFillColor(page, AK_SERIES_COLOR).first().hover();
    await assertEChartsTooltip(page, { rows: [{ name: "Other", value: "9" }] });
    await otherSeriesChartPaths(page).first().hover();
    await assertEChartsTooltip(page, {
      header: "September 2025",
      rows: [
        { name: "IA", value: "3" },
        { name: "KY", value: "2" },
        { name: "FL", value: "1" },
        { name: "GA", value: "1" },
        { name: "ID", value: "1" },
        { name: "IL", value: "1" },
        { name: "Total", value: "9" },
      ],
    });

    // Test "graph.max_categories" change
    await setMaxCategories(4);
    await queryBuilderMain(page).click(); // close popover
    await chartPathWithFillColor(page, AK_SERIES_COLOR).first().hover();
    await expect(echartsTooltip(page).locator("tr")).toHaveCount(5);
    await expect(queryBuilderMain(page).getByTestId("legend-item")).toHaveCount(
      5,
    );

    // Test can move series in/out of "Other" series
    await moveDnDKitElementVertically(getDraggableElements(page).nth(3), 150); // Move AZ into "Other"
    await moveDnDKitElementVertically(getDraggableElements(page).nth(6), -150); // Move CT out of "Other"

    await expect(queryBuilderMain(page).getByTestId("legend-item")).toHaveCount(
      5,
    );
    await expect(
      queryBuilderMain(page)
        .getByTestId("legend-item")
        .filter({ hasText: /AZ/ }),
    ).toHaveCount(0);
    await expect(
      queryBuilderMain(page)
        .getByTestId("legend-item")
        .filter({ hasText: /CT/ })
        .first(),
    ).toBeVisible();

    // Test "graph.max_categories" removes "Other" altogether
    await setMaxCategories(0);
    await chartPathWithFillColor(page, AK_SERIES_COLOR).first().hover();
    await expect(echartsTooltip(page).locator("tr")).toHaveCount(14);
    await expect(queryBuilderMain(page).getByTestId("legend-item")).toHaveCount(
      14,
    );
    await expect(otherSeriesChartPaths(page)).toHaveCount(0);
    await setMaxCategories(8, { viaBreakoutSettings: true });

    // Test "graph.other_category_aggregation_fn" for native queries
    await openNotebook(page);
    await queryBuilderHeader(page).getByLabel("View SQL", { exact: true }).click();
    await page
      .getByTestId("native-query-preview-sidebar")
      .getByRole("button", { name: "Convert this question to SQL", exact: true })
      .click();
    await page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/dataset",
    );
    await queryBuilderMain(page).getByTestId("visibility-toggler").click();

    await openVizSettingsSidebar(page);
    await setOtherCategoryAggregationFn("Average");

    await chartPathWithFillColor(page, AK_SERIES_COLOR).first().hover();
    await assertEChartsTooltip(page, {
      rows: [{ name: "Other", value: "1.5" }],
    });

    await otherSeriesChartPaths(page).first().hover();
    await assertEChartsTooltip(page, {
      header: "September 2025",
      rows: [
        { name: "IA", value: "3" },
        { name: "KY", value: "2" },
        { name: "FL", value: "1" },
        { name: "GA", value: "1" },
        { name: "ID", value: "1" },
        { name: "IL", value: "1" },
        { name: "Average", value: "1.5" },
      ],
    });

    await setOtherCategoryAggregationFn("Min");

    await chartPathWithFillColor(page, AK_SERIES_COLOR).first().hover();
    await assertEChartsTooltip(page, { rows: [{ name: "Other", value: "1" }] });

    await otherSeriesChartPaths(page).first().hover();
    await assertEChartsTooltip(page, { rows: [{ name: "Min", value: "1" }] });

    await setOtherCategoryAggregationFn("Max");

    await chartPathWithFillColor(page, AK_SERIES_COLOR).first().hover();
    await assertEChartsTooltip(page, { rows: [{ name: "Other", value: "3" }] });

    await otherSeriesChartPaths(page).first().hover();
    await assertEChartsTooltip(page, { rows: [{ name: "Max", value: "3" }] });
  });

  test("should format goal tooltip value as a percent when the Stacking option is 'Stack - 100%'", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      ...breakoutBarChart,
      visualization_settings: {
        "graph.goal_value": 87.5,
        "graph.show_goal": true,
        "stackable.stack_type": "normalized",
      },
    });

    await triggerMousemove(
      echartsContainer(page).getByText("Goal", { exact: true }),
    );

    await expect(tooltip(page).getByText("Goal:", { exact: true })).toBeVisible();
    await expect(tooltip(page).getByText("87.5%", { exact: true })).toBeVisible();
  });

  test("should display all axis labels for 12 months of data (metabase#60475)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 800 });

    // Create a bar chart showing count of orders by month for the last 12 months
    await visitAdhoc(page, {
      display: "bar",
      dataset_query: {
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
          filter: [
            "time-interval",
            ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
            -12,
            "month",
          ],
        },
        database: SAMPLE_DB_ID,
      },
    });

    await expect(echartsContainer(page)).toBeVisible();

    // ECharts renders axis labels as text elements in SVG; we should see labels
    // for all 12 months.
    const axisLabels = echartsContainer(page).locator(
      'svg text[text-anchor="middle"]',
    );
    await expect
      .poll(() => axisLabels.count())
      .toBeGreaterThanOrEqual(12);
    await expect(axisLabels.first()).toBeVisible();
  });

  test("should rotate axis labels when they do not fit horizontally instead of hiding them (metabase#68048)", async ({
    page,
  }) => {
    // Use a smaller viewport to ensure labels need to rotate
    await page.setViewportSize({ width: 940, height: 800 });

    const query = `
      SELECT * FROM (
        VALUES
        ('Alnyba', 390000),
        ('Bvsieginlri', 500000),
        ('Cflonta', 700000),
        ('Dgamruh', 50000),
        ('Eitstrugb', 130000),
        ('Farnotcs', 107000),
        ('Gkro', 750000)
      ) AS Data(LABEL, amount)
    `;

    await visitNativeAdhoc(page, {
      display: "bar",
      dataset_query: {
        type: "native",
        native: { query, "template-tags": {} },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        "graph.dimensions": ["LABEL"],
        "graph.metrics": ["amount"],
      },
    });

    // Open the data reference sidebar to squish the data further
    await page.getByLabel("Learn about your data", { exact: true }).click();

    await expect(echartsContainer(page)).toBeVisible();

    const expectedLabels = [
      "Alnyba",
      "Bvsieginlri",
      "Cflonta",
      "Dgamruh",
      "Eitstrugb",
      "Farnotcs",
      "Gkro",
    ];

    // When labels don't fit horizontally, ECharts rotates them
    for (const label of expectedLabels) {
      await expect(
        echartsContainer(page)
          .locator("text")
          .filter({ hasText: new RegExp(label) })
          .first(),
      ).toBeVisible();
    }

    // Verify labels are rotated by checking for transform attribute with
    // rotation — ECharts applies rotation via transform when labels don't fit.
    const rotatedLabels = echartsContainer(page)
      .locator("text")
      .filter({ hasText: new RegExp(expectedLabels.join("|")) });
    await expect(rotatedLabels).toHaveCount(7);
    await expect(rotatedLabels.first()).toHaveAttribute("transform", /matrix/);
  });
});
