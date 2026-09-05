/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/waterfall.cy.spec.js
 *
 * New helpers (verifyWaterfallRendering / switchToWaterfallDisplay /
 * getWaterfallDataLabels / assertEChartsTooltipNotContain) live in
 * support/waterfall.ts; everything else is imported read-only from the shared
 * modules.
 *
 * Mapping notes:
 * - `cy.contains("Visualization")` / `cy.findByText("Visualization")` both open
 *   the chart-type picker → openVizTypeSidebar (getByTestId("viz-type-button")).
 * - Native ad-hoc queries are not autorun from the hash, so H.visitQuestionAdhoc
 *   (default autorun) runs the query itself → visitNativeAdhoc.
 * - `cy.findByTestId("native-query-editor-container").icon("play").click()`
 *   → runNativeQuery (clicks the same play icon, waits for /api/dataset).
 * - `.trigger("mousemove")` is a synthetic dispatch (not a real hover) →
 *   triggerMousemove; `.realHover()` → hover().
 * - The two "should correctly switch into single-series mode for ad-hoc
 *   queries" tests share the upstream's (duplicated) title verbatim.
 */
import type { Page } from "@playwright/test";

import { createQuestion } from "../support/factories";
import { echartsContainer, leftSidebar, openVizSettingsSidebar } from "../support/charts";
import { openVizTypeSidebar } from "../support/charts-extras";
import { customExpressionEditor } from "../support/custom-column";
import { customExpressionEditorType } from "../support/custom-column-3";
import { sidebar } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { findByDisplayValue } from "../support/filters-repros";
import { openTableNotebook, summarizeNotebook } from "../support/joins";
import { chartPathWithFillColor } from "../support/legend";
import { triggerMousemove } from "../support/line-chart";
import { startNewNativeQuestion, typeInNativeEditor } from "../support/native-editor";
import { getNotebookStep, visualize } from "../support/notebook";
import { runNativeQuery } from "../support/models";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { icon, popover, visitQuestion } from "../support/ui";
import { goalLine } from "../support/visualizer-basics";
import {
  assertEChartsTooltip,
  visitAdhoc,
  visitNativeAdhoc,
} from "../support/viz-charts-repros";
import {
  assertEChartsTooltipNotContain,
  countDisplayValue,
  getWaterfallDataLabels,
  switchToWaterfallDisplay,
  verifyWaterfallRendering,
} from "../support/waterfall";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

test.describe("scenarios > visualizations > waterfall", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should work with ordinal series", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "select 'A' as product, 10 as profit union select 'B' as product, -4 as profit",
    );
    await runNativeQuery(page);
    await openVizTypeSidebar(page);
    await icon(page, "waterfall").click();

    await verifyWaterfallRendering(page, "PRODUCT", "PROFIT");
  });

  test("should work with ordinal series and numeric X-axis (metabase#15550)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "select 1 as X, 20 as Y union select 2 as X, -10 as Y",
    );
    await runNativeQuery(page);
    await openVizTypeSidebar(page);
    await switchToWaterfallDisplay(page);

    await sidebar(page)
      .getByPlaceholder("Select a field", { exact: true })
      .first()
      .click();
    await popover(page).getByText("X", { exact: true }).click();

    await sidebar(page)
      .getByPlaceholder("Select a field", { exact: true })
      .last()
      .click();
    await popover(page).getByText("Y", { exact: true }).click();

    await sidebar(page).getByText("Axes", { exact: true }).click();

    await (await findByDisplayValue(sidebar(page), "Linear")).click();
    await popover(page).getByText("Ordinal", { exact: true }).click();

    await verifyWaterfallRendering(page, "X", "Y");
  });

  test("should work with quantitative series", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "select 1 as X, 10 as Y union select 2 as X, -2 as Y",
    );
    await runNativeQuery(page);
    await openVizTypeSidebar(page);
    await switchToWaterfallDisplay(page);

    await sidebar(page)
      .getByPlaceholder("Select a field", { exact: true })
      .first()
      .click();
    await popover(page).getByText("X", { exact: true }).click();

    await sidebar(page)
      .getByPlaceholder("Select a field", { exact: true })
      .last()
      .click();
    await popover(page).getByText("Y", { exact: true }).click();

    await verifyWaterfallRendering(page, "X", "Y");
  });

  test("should work with time-series data", async ({ page }) => {
    await openTableNotebook(page, ORDERS_ID);
    await summarizeNotebook(page);
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await page
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("Created At", { exact: true }).click();

    // `cy.findByText("Filter")` is unscoped upstream; post-summarize the
    // notebook renders a Filter action on both the data and summarize steps.
    // The expression references `[Created At: Month]` — the post-aggregation
    // breakout column — so the filter belongs to the summarize step (a
    // first-stage data-step filter reports "Unknown column: Created At: Month").
    await getNotebookStep(page, "summarize")
      .getByRole("button", { name: "Filter", exact: true })
      .click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await customExpressionEditorType(
      page,
      "between([Created At: Month], '2025-01-01', '2025-08-01')",
    );
    await customExpressionEditor(page).blur();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await visualize(page);

    await openVizTypeSidebar(page);
    await switchToWaterfallDisplay(page);

    await verifyWaterfallRendering(page, "Created At", "Count");
  });

  test("should hide the Total label if there is no space", async ({ page }) => {
    await openTableNotebook(page, ORDERS_ID);
    await summarizeNotebook(page);
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await page
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("Created At", { exact: true }).click();

    await visualize(page);

    await openVizTypeSidebar(page);
    await switchToWaterfallDisplay(page);

    await expect(
      echartsContainer(page).getByText(caseSensitiveSubstring("Total")),
    ).toHaveCount(0);
  });

  test.describe("multi-series (metabase#15152)", () => {
    const DATASET_QUERY = {
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      database: SAMPLE_DB_ID,
    };

    async function testSwitchingToWaterfall(page: Page) {
      await openVizTypeSidebar(page);
      await switchToWaterfallDisplay(page);

      const chart = echartsContainer(page);
      await expect(
        chart.getByText(caseSensitiveSubstring("Created At: Year")).first(),
      ).toBeVisible(); // x-axis
      await expect(
        chart.getByText(caseSensitiveSubstring("Count")).first(),
      ).toBeVisible(); // y-axis
      await expect(
        chart.getByText(caseSensitiveSubstring("Sum of Total")),
      ).toHaveCount(0);

      // x-axis labels (some)
      for (const label of ["2025", "2026", "2029", "Total"]) {
        await expect(
          chart.getByText(caseSensitiveSubstring(label)).first(),
        ).toBeVisible();
      }
      // y-axis labels (some)
      for (const label of ["0", "3,000", "6,000", "18,000", "21,000"]) {
        await expect(
          chart.getByText(caseSensitiveSubstring(label)).first(),
        ).toBeVisible();
      }

      const sidebarLeft = leftSidebar(page);
      await expect
        .poll(() => countDisplayValue(sidebarLeft, "Count"))
        .toBeGreaterThan(0);
      await expect
        .poll(() => countDisplayValue(sidebarLeft, "Sum of Total"))
        .toBe(0);
      await expect(sidebarLeft.getByText(/Add another/)).toHaveCount(0);

      await (await findByDisplayValue(sidebarLeft, "Count")).click();
      await popover(page).getByText("Sum of Total", { exact: true }).click();

      await expect
        .poll(() => countDisplayValue(sidebarLeft, "Sum of Total"))
        .toBeGreaterThan(0);
      await expect
        .poll(() => countDisplayValue(sidebarLeft, "Count"))
        .toBe(0);

      await expect(
        chart.getByText(caseSensitiveSubstring("Sum of Total")).first(),
      ).toBeVisible(); // x-axis
      await expect(
        chart.getByText(caseSensitiveSubstring("Created At: Year")).first(),
      ).toBeVisible(); // y-axis
      await expect(
        chart.getByText(caseSensitiveSubstring("Count")),
      ).toHaveCount(0);

      // x-axis labels (some)
      for (const label of ["2025", "2026", "2029", "Total"]) {
        await expect(
          chart.getByText(caseSensitiveSubstring(label)).first(),
        ).toBeVisible();
      }
      // y-axis labels (some)
      for (const label of ["0", "300,000", "900,000", "1,800,000"]) {
        await expect(
          chart.getByText(caseSensitiveSubstring(label)).first(),
        ).toBeVisible();
      }
    }

    test("should correctly switch into single-series mode for ad-hoc queries", async ({
      page,
    }) => {
      await visitAdhoc(page, {
        dataset_query: DATASET_QUERY,
        display: "line",
      });
      await testSwitchingToWaterfall(page);
    });

    // Upstream titles this identically to the ad-hoc test above (a copy-paste
    // typo); Playwright forbids duplicate titles, so this saved-question path
    // gets a distinct-but-faithful title.
    test("should correctly switch into single-series mode for saved queries", async ({
      page,
      mb,
    }) => {
      const { id } = await createQuestion(mb.api, {
        name: "Q1",
        query: DATASET_QUERY.query,
        display: "line",
      });
      await visitQuestion(page, id);
      await testSwitchingToWaterfall(page);
    });
  });

  test("should not allow you to choose X-axis breakout", async ({ page }) => {
    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    await openVizTypeSidebar(page);
    await switchToWaterfallDisplay(page);

    await sidebar(page)
      .getByPlaceholder("Select a field", { exact: true })
      .first()
      .click();
    await popover(page).getByText("Created At: Year", { exact: true }).click();

    await sidebar(page)
      .getByPlaceholder("Select a field", { exact: true })
      .last()
      .click();
    await popover(page).getByText("Count", { exact: true }).click();

    await expect(echartsContainer(page)).toBeVisible(); // Chart renders after adding a metric

    await expect(page.getByText(/Add another/)).toHaveCount(0);
  });

  test("should work for unaggregated data (metabase#15465)", async ({ page }) => {
    await visitNativeAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-02', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\"",
        },
        database: SAMPLE_DB_ID,
      },
    });
    await openVizTypeSidebar(page);
    await icon(page, "waterfall").click({ force: true });
    await expect(
      chartPathWithFillColor(page, "#88BF4D").filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("should display correct values when one of them is 0 (metabase#16246)", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f',0),\n('g', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    await expect(getWaterfallDataLabels(page).nth(-3)).toHaveText("0");
    await expect(getWaterfallDataLabels(page).last()).toHaveText("0.1");
  });

  test("should now display null values (metabase#16246)", async ({ page }) => {
    await visitNativeAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f',null),\n('g', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    // the null data label which should exist at index -3 should now display no
    // label. so the label at index -3 should be the label before the null point
    await expect(getWaterfallDataLabels(page).nth(-3)).toHaveText("0.1");

    // but the x-axis label and area should still be shown for the null point
    await expect(
      echartsContainer(page).getByText(caseSensitiveSubstring("f")).first(),
    ).toBeVisible();

    await expect(getWaterfallDataLabels(page).nth(-2)).toHaveText("(2)");
    await expect(getWaterfallDataLabels(page).last()).toHaveText("0.1");
  });

  test("should correctly apply column value scaling in tool-tips (metabase#44176)", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
        column_settings: { '["name","C2"]': { scale: 0.1 } },
      },
    });

    await expect(getWaterfallDataLabels(page).first()).toHaveText("0.2");

    await triggerMousemove(chartPathWithFillColor(page, "#88BF4D").first());

    await assertEChartsTooltip(page, {
      rows: [
        {
          name: "C2",
          value: "0.2",
        },
      ],
    });
  });

  test("should allow adding non-series columns to the tooltip", async ({
    page,
  }) => {
    const INCREASE_COLOR = "#00FF00";

    const getFirstWaterfallSegment = () =>
      chartPathWithFillColor(page, INCREASE_COLOR).first();

    await visitAdhoc(page, {
      display: "waterfall",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
      },
      visualization_settings: {
        "waterfall.increase_color": INCREASE_COLOR,
      },
    });

    await getFirstWaterfallSegment().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [{ name: "Count", value: "744", color: INCREASE_COLOR }],
    });
    await assertEChartsTooltipNotContain(page, ["Sum of Total"]);

    await openVizSettingsSidebar(page);

    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page)
      .getByPlaceholder("Enter column names", { exact: true })
      .click();
    await page
      .getByRole("option", { name: "Sum of Total", exact: true })
      .click();

    await getFirstWaterfallSegment().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Count", value: "744", color: INCREASE_COLOR },
        { name: "Sum of Total", value: "42,156.87" },
      ],
    });
  });

  test("should show tooltip when hovering the total bar (metabase#48118)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      display: "waterfall",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
      },
    });

    const totalBarColor = "#303D46";

    await chartPathWithFillColor(page, totalBarColor).hover();

    await assertEChartsTooltip(page, {
      header: "Total",
      rows: [{ name: "Count", value: "18,760", color: totalBarColor }],
    });
  });

  test("should display goal line when configured", async ({ page }) => {
    await visitAdhoc(page, {
      display: "waterfall",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
      },
    });

    await openVizSettingsSidebar(page);

    await leftSidebar(page)
      .getByText(caseSensitiveSubstring("Display"))
      .first()
      .click();

    await leftSidebar(page).getByText("Goal line", { exact: true }).click();
    await leftSidebar(page)
      .getByLabel("Goal value", { exact: true })
      .fill("11000");
    await leftSidebar(page)
      .getByLabel("Goal label", { exact: true })
      .fill("Target");

    await expect(
      echartsContainer(page).getByText(caseSensitiveSubstring("Target")).first(),
    ).toBeVisible();
    // The goal line is a zero-height horizontal <path>; Playwright's toBeVisible
    // treats a zero-area box as hidden (rule 3), so assert existence like the
    // upstream should("exist").
    await expect(goalLine(page).first()).toBeAttached();
  });

  test.describe("scenarios > visualizations > waterfall settings", () => {
    test.beforeEach(async ({ page }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(page, "select 'A' as X, -4.56 as Y");
      await runNativeQuery(page);
      await openVizTypeSidebar(page);
      await switchToWaterfallDisplay(page);
    });

    test("should have increase, decrease, and total color options", async ({
      page,
    }) => {
      await leftSidebar(page)
        .getByText(caseSensitiveSubstring("Display"))
        .first()
        .click();
      await leftSidebar(page).getByText("Increase color", { exact: true }).click();
      await leftSidebar(page).getByText("Decrease color", { exact: true }).click();
      await leftSidebar(page).getByText("Total color", { exact: true }).click();
    });

    test("should allow toggling of the total bar", async ({ page }) => {
      await leftSidebar(page)
        .getByText(caseSensitiveSubstring("Display"))
        .first()
        .click();

      await page
        .locator('[data-field-title="Show total"]')
        .getByRole("switch")
        .click({ force: true });

      await expect(
        echartsContainer(page).getByText(caseSensitiveSubstring("Total")),
      ).toHaveCount(0);

      await page
        .locator('[data-field-title="Show total"]')
        .getByRole("switch")
        .click({ force: true });
      await expect(
        echartsContainer(page).getByText(caseSensitiveSubstring("Total")).first(),
      ).toBeVisible();
    });

    test("should allow toggling of value labels", async ({ page }) => {
      await leftSidebar(page)
        .getByText(caseSensitiveSubstring("Display"))
        .first()
        .click();

      await expect(
        echartsContainer(page).getByText(caseSensitiveSubstring("(4.56)")),
      ).toHaveCount(0);

      await page
        .locator('[data-field-title="Show values on data points"]')
        .getByRole("switch")
        .click({ force: true });
      await expect(
        echartsContainer(page)
          .getByText(caseSensitiveSubstring("(4.56)"))
          .first(),
      ).toBeVisible();
    });
  });
});
