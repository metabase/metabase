/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/rows.cy.spec.js
 *
 * The row chart is a visx SVG (not ECharts): bars are
 * `[role="graphics-symbol"]`, the plotted-bars group is `.visx-columns`, the
 * left category axis is `.visx-axis-left`. New locator helpers live in
 * support/rows.ts; everything else is imported read-only from the shared
 * modules.
 *
 * Mapping notes:
 * - `H.createNativeQuestion(..., { visitQuestion: true })` → createNativeQuestion
 *   then visitQuestion(page, id); likewise createQuestion.
 * - `H.visitQuestionAdhoc(structured)` → visitQuestionAdhoc.
 * - `cy.findByText(str|number)` (testing-library, exact) → getByText(str, {exact:true}).
 * - `.invoke("width")` (jQuery) → boxWidth (boundingBox().width).
 * - `H.main()` (cy.get("main")) → page.locator("main").
 * - The two metabase#14285 Firefox-only repros are `{ browser: "firefox" }` in
 *   Cypress, so they never run in the Chrome CI leg. Our harness is Chromium
 *   only, so they are ported as test.skip (Firefox-specific, per the upstream
 *   comment "still possible to test it locally").
 */
import _ from "underscore";

import { leftSidebar, openVizSettingsSidebar } from "../support/charts";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  boxWidth,
  queryVisualizationRoot,
  rowChartBars,
  visxAxisLeft,
  visxColumns,
} from "../support/rows";
import { visitQuestion } from "../support/ui";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > visualizations > rows", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  // Until we enable multi-browser support, this repro is skipped in CI.
  // Issue was specific to Firefox only — it is still possible to test it
  // locally. Our Playwright harness runs Chromium only, so these stay skipped.
  for (const testValue of ["0", "null"]) {
    test.skip(`should not collapse rows when last value is ${testValue} (metabase#14285)`, async ({
      page,
      mb,
    }) => {
      const { id } = await createNativeQuestion(mb.api, {
        name: "14285",
        native: {
          query: `
              with temp as (
                select 'a' col1, 25 col2 union all
                select 'b', 10 union all
                select 'c', 15 union all
                select 'd', ${testValue} union all
                select 'e', 30 union all
                select 'f', 35
              ) select * from temp
              order by 2 desc
            `,
          "template-tags": {},
        },
        display: "row",
      });
      await visitQuestion(page, id);

      const root = queryVisualizationRoot(page);
      for (const letter of ["a", "b", "c", "d", "e", "f"]) {
        await expect(root.getByText(letter, { exact: true })).toBeVisible();
      }
    });
  }

  test("should display a row chart", async ({ page, mb }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "14285",
      native: {
        query: `
            with temp as (
              select 'a' col1, 51 column_two union all
              select 'b', 41 union all
              select 'c', 31 union all
              select 'd', 21 union all
              select 'e', 11 union all
              select 'f', 4
            ) select * from temp
            order by 2 desc
          `,
        "template-tags": {},
      },
      display: "row",
      visualization_settings: {
        "graph.show_values": true, // so we can assert on them
      },
    });
    await visitQuestion(page, id);

    const root = queryVisualizationRoot(page);
    for (const letter of ["a", "b", "c", "d", "e", "f"]) {
      await expect(root.getByText(letter, { exact: true })).toBeVisible();
    }
    for (const value of [51, 41, 31, 21, 11, 4]) {
      await expect(
        root.getByText(String(value), { exact: true }),
      ).toBeVisible();
    }
    await expect(root.getByText("COLUMN_TWO", { exact: true })).toBeVisible();

    // Verify hovering bars does not change their size (metabase#43631)
    const firstBar = rowChartBars(root).first();
    const prevWidth = await boxWidth(firstBar);
    await firstBar.hover();
    const newWidth = await boxWidth(firstBar);
    expect(prevWidth).toBe(newWidth);
  });

  test("should handle very long product titles in row chart", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "Orders created before June 1st 2022",
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          LongName: [
            "concat",
            ..._.times(10, () => [
              "field",
              PRODUCTS.TITLE,
              { "base-type": "type/Text" },
            ]),
          ],
        },
        aggregation: [["count"]],
        breakout: [
          ["expression", "LongName", { "base-type": "type/Text" }],
        ],
      },
      display: "row",
    });
    await visitQuestion(page, id);

    const root = queryVisualizationRoot(page);

    // Check that the visualization renders without errors
    await expect(rowChartBars(root).first()).toBeVisible();
    expect(await rowChartBars(root).count()).toBeGreaterThan(0);

    // Check chart bars section — it should take 50% of width
    await expect(visxColumns(root)).toBeAttached();
    expect(await boxWidth(visxColumns(root))).toBeGreaterThan(500);

    // Check that axis labels are present
    await expect(visxAxisLeft(root)).toBeAttached();
    expect(await boxWidth(visxAxisLeft(root))).toBeGreaterThan(500);
  });

  test("should display an error message when there are more series than the chart supports", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      display: "row",
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
      page
        .locator("main")
        .getByText(
          "This chart type doesn't support more than 100 series of data.",
          { exact: true },
        ),
    ).toBeVisible();
  });

  test("should show error when adding high-cardinality breakout via UI (metabase#64086)", async ({
    page,
  }) => {
    const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

    await visitQuestionAdhoc(page, {
      display: "row",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "minute" }],
            ["field", ORDERS.ID, null],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    });

    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByText("Data", { exact: true }).click();
    await leftSidebar(page)
      .getByText("Add series breakout", { exact: true })
      .click();

    await expect(
      page
        .locator("main")
        .getByText(
          "This chart type doesn't support more than 100 series of data.",
          { exact: true },
        ),
    ).toBeVisible();
  });
});
