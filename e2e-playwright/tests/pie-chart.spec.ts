/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/pie_chart.cy.spec.js
 *
 * No gating tags upstream. Every test is ported.
 *
 * Notes on faithfulness:
 * - Pie-slice hovers (`realHover` / `trigger("mousemove")` on a wedge or its
 *   data label) are ported as `hover({ force: true })`: the slice's own `<text>`
 *   label sits on top of the wedge path and intercepts the actionable hover, but
 *   zrender hit-tests by coordinate so the tooltip still opens (see PORTING.md
 *   pie/label hover-force). Legend hovers stay plain `.hover()`.
 * - The devMode describe uses `page.route` to rewrite
 *   `token-features.development_mode` in the /api/session/properties response,
 *   mirroring the Cypress `cy.intercept(...).continue(res => ...)`.
 * - `H.createQuestionAndDashboard(...).then(({ body: { dashboard_id } }))`
 *   becomes `mb.api.createQuestionAndDashboard(...)` → `{ dashboardId }`.
 * - The internal `@dataset` alias of H.visitQuestionAdhoc (VIZ-210) is a
 *   `page.waitForResponse` on POST /api/dataset registered before the drill.
 */
import { chartPathWithFillColor } from "../support/binning";
import {
  echartsContainer,
  leftSidebar,
  openVizSettingsSidebar,
} from "../support/charts";
import { getDraggableElements } from "../support/charts-extras";
import { pieSliceWithColor } from "../support/chart-drill";
import { createQuestionAndDashboard } from "../support/click-behavior";
import { test, expect } from "../support/fixtures";
import { assertQueryBuilderRowCount, tableHeaderClick } from "../support/notebook";
import {
  changeRowLimit,
  checkLegendItemAriaCurrent,
  confirmSliceClickBehavior,
  ensurePieChartRendered,
  getLimitedQuery,
  renameSlice,
} from "../support/pie-chart";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { icon, popover, visitDashboard } from "../support/ui";
import {
  assertEChartsTooltip,
  moveDnDKitElementVertically,
  visitAdhoc,
  visitNativeAdhoc,
} from "../support/viz-charts-repros";

const { ACCOUNTS, ACCOUNTS_ID, PRODUCTS, PRODUCTS_ID, ORDERS_ID, ORDERS, PEOPLE } =
  SAMPLE_DATABASE;

const testQuery = {
  type: "query" as const,
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  database: SAMPLE_DB_ID,
};

const twoRingQuery = {
  database: 1,
  type: "query" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "day-of-week" },
      ],
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
};

const threeRingQuery = {
  database: 1,
  type: "query" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
      [
        "field",
        PEOPLE.SOURCE,
        { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
      ],
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
};

test.describe("scenarios > visualizations > pie chart", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should render a pie chart (metabase#12506) (#35244)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: testQuery,
      display: "pie",
    });

    await ensurePieChartRendered(
      page,
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
      null,
      null,
      200,
    );

    // chart should be centered (#48123)
    const legendWidth = await page
      .getByTestId("chart-legend")
      .evaluate((el) => el.getBoundingClientRect().width);
    const spacerWidth = await page
      .getByTestId("chart-legend-spacer")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(legendWidth).toEqual(spacerWidth);

    // #35244 — the label is on the (non-focusable) svg icon, which Playwright
    // treats as "not enabled"; Cypress clicks it regardless, so force it.
    await page
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });
    await tableHeaderClick(page, "Count");
    const pop = popover(page);
    await expect(pop.getByRole("img", { name: /filter/ }).first()).toBeAttached();
    await expect(pop.getByRole("img", { name: /gear/ })).toHaveCount(0);
    await expect(
      pop.getByRole("img", { name: /eye_crossed_out/ }),
    ).toHaveCount(0);
  });

  test("should mute items in legend when hovering (metabase#29224)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: testQuery,
      display: "pie",
    });

    // flakiness prevention
    await expect(
      page.getByTestId("chart-container").getByText("Total", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("view-footer").getByText("Showing 4 rows", {
        exact: true,
      }),
    ).toBeVisible();

    await page
      .getByTestId("chart-legend")
      .getByText("Doohickey", { exact: true })
      .hover();

    for (const [title, value] of [
      ["Doohickey", "true"],
      ["Gadget", "false"],
      ["Gizmo", "false"],
      ["Widget", "false"],
    ]) {
      await checkLegendItemAriaCurrent(page, title, value);
    }
  });

  test("should not truncate legend titles when enabling percentages (metabase#48207)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: testQuery,
      display: "pie",
      visualization_settings: {
        "pie.percent_visibility": "off",
      },
    });

    await openVizSettingsSidebar(page);

    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page).getByText("In legend", { exact: true }).click();

    const widget = page
      .getByTestId("chart-legend")
      .getByText("Widget", { exact: true });
    // When text is truncated, offsetWidth will be less than scrollWidth
    const { offsetWidth, scrollWidth } = await widget.evaluate((el) => ({
      offsetWidth: (el as HTMLElement).offsetWidth,
      scrollWidth: (el as HTMLElement).scrollWidth,
    }));
    expect(offsetWidth).toEqual(scrollWidth);
  });

  test("should instantly toggle the total after changing the setting", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: testQuery,
      display: "pie",
    });

    await openVizSettingsSidebar(page);

    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page).getByText("Show total", { exact: true }).click();

    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText("Total", { exact: true }),
    ).toHaveCount(0);

    await leftSidebar(page).getByText("Show total", { exact: true }).click();

    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText("Total", { exact: true }),
    ).toBeVisible();
  });

  test("should add new slices to the chart if they appear in the query result", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: getLimitedQuery(testQuery, 2),
      display: "pie",
    });

    await ensurePieChartRendered(page, ["Gadget", "Doohickey"]);

    await changeRowLimit(page, 2, 4);

    await ensurePieChartRendered(page, [
      "Widget",
      "Gadget",
      "Gizmo",
      "Doohickey",
    ]);
  });

  test("should preserve a slice's settings if its row is removed then reappears in the query result", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: getLimitedQuery(testQuery, 4),
      display: "pie",
    });

    await ensurePieChartRendered(page, [
      "Widget",
      "Gadget",
      "Gizmo",
      "Doohickey",
    ]);

    await openVizSettingsSidebar(page);

    // Open color picker
    await page.getByLabel("#F2A86F", { exact: true }).click();

    // Change color
    await popover(page).getByLabel("#509EE3", { exact: true }).click();

    await renameSlice(page, "Widget", "Woooget");

    const wooogetDrag = getDraggableElements(page)
      .filter({ hasText: "Woooget" })
      .first();
    await moveDnDKitElementVertically(wooogetDrag, 100);

    await ensurePieChartRendered(page, [
      "Woooget",
      "Gadget",
      "Gizmo",
      "Doohickey",
    ]);
    await expect(chartPathWithFillColor(page, "#509EE3").first()).toBeVisible();

    await expect(
      page.getByTestId("chart-legend").locator("li").nth(2),
    ).toContainText("Woooget");

    await changeRowLimit(page, 4, 2);
    await ensurePieChartRendered(page, ["Gadget", "Doohickey"]);

    // Ensure row settings should show only two rows
    await openVizSettingsSidebar(page);
    await expect(getDraggableElements(page)).toHaveCount(2);
    await expect(
      getDraggableElements(page).filter({ hasText: "Woooget" }),
    ).toHaveCount(0);
    await expect(
      getDraggableElements(page).filter({ hasText: "Gizmo" }),
    ).toHaveCount(0);

    await renameSlice(page, "Gadget", "Katget");
    const katgetDrag = getDraggableElements(page)
      .filter({ hasText: "Katget" })
      .first();
    await moveDnDKitElementVertically(katgetDrag, 30);

    await changeRowLimit(page, 2, 4);
    await ensurePieChartRendered(page, [
      "Doohickey",
      "Katget",
      "Gizmo",
      "Woooget",
    ]);

    await page
      .getByTestId("chart-legend")
      .getByText("Woooget", { exact: true })
      .hover();
    await expect(chartPathWithFillColor(page, "#509EE3").first()).toBeVisible();

    await expect(
      page.getByTestId("chart-legend").locator("li").nth(1),
    ).toContainText("Katget");
    await expect(
      page.getByTestId("chart-legend").locator("li").nth(3),
    ).toContainText("Woooget");
  });

  test("should automatically map dimension columns in query to rings", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: twoRingQuery,
      display: "pie",
    });

    await ensurePieChartRendered(
      page,
      ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
    );
  });

  test("should allow the user to edit rings", async ({ page }) => {
    await visitAdhoc(page, {
      dataset_query: threeRingQuery,
      display: "pie",
      visualization_settings: {
        "pie.slice_threshold": 0,
      },
    });

    await ensurePieChartRendered(
      page,
      ["2025", "2026", "2027", "2028", "2029"],
      ["Affiliate", "Facebook", "Google", "Organic", "Twitter"],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
    );

    await openVizSettingsSidebar(page);

    await icon(
      page.getByTestId("chartsettings-field-picker").last(),
      "close",
    ).click({ force: true });

    await ensurePieChartRendered(
      page,
      ["2025", "2026", "2027", "2028", "2029"],
      ["Affiliate", "Facebook", "Google", "Organic", "Twitter"],
    );

    // The Select input overlays its own chevrondown icon and intercepts the
    // pointer; Cypress's realClick lands on the icon anyway, so force it (the
    // click bubbles to the Select trigger and opens the dropdown).
    await icon(
      page.getByTestId("chartsettings-field-picker").last(),
      "chevrondown",
    ).click({ force: true });

    await popover(page).getByText("Product → Category", { exact: true }).click();

    await ensurePieChartRendered(
      page,
      ["2025", "2026", "2027", "2028", "2029"],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
    );

    await leftSidebar(page).getByText("Add Ring", { exact: true }).click();
    await popover(page).getByText("User → Source", { exact: true }).click();

    await ensurePieChartRendered(
      page,
      ["2025", "2026", "2027", "2028", "2029"],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
      ["Affiliate", "Facebook", "Google", "Organic", "Twitter"],
    );
  });

  for (const devMode of [false, true]) {
    test(`should handle hover and drill throughs correctly - development ${devMode}`, async ({
      page,
    }) => {
      await page.route("**/api/session/properties", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body["token-features"].development_mode = devMode;
        await route.fulfill({ response, json: body });
      });

      await visitAdhoc(page, {
        dataset_query: twoRingQuery,
        display: "pie",
        visualization_settings: {
          "pie.slice_threshold": 0,
        },
      });

      await ensurePieChartRendered(
        page,
        [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ],
        ["Doohickey", "Gadget", "Gizmo", "Widget"],
      );

      // The pie drill lives on the wedge <path>, not the label <text> (clicking
      // the label opens the tooltip but never drills, and the open tooltip
      // overlay intercepts a real click at the label). Saturday's inner-ring
      // slice has a unique fill (#51528D per the tooltip), so drill via the
      // wedge path — hovering it still shows the whole-ring tooltip.
      const saturdaySlice = pieSliceWithColor(page, "#51528D").first();
      await saturdaySlice.hover({ force: true });

      // All the assertions after this point are fragile and susceptible to
      // breaking when we shift years in the Sample Database
      await assertEChartsTooltip(page, {
        header: "Created At: Day of week",
        rows: [
          { color: "#51528D", name: "Saturday", value: "2,661", secondaryValue: "14.18 %" },
          { color: "#ED8535", name: "Thursday", value: "2,646", secondaryValue: "14.10 %" },
          { color: "#E75454", name: "Tuesday", value: "2,590", secondaryValue: "13.81 %" },
          { color: "#689636", name: "Sunday", value: "2,678", secondaryValue: "14.28 %" },
          { color: "#8A5EB0", name: "Monday", value: "2,719", secondaryValue: "14.49 %" },
          { color: "#69C8C8", name: "Friday", value: "2,690", secondaryValue: "14.34 %" },
          { color: "#F7C41F", name: "Wednesday", value: "2,776", secondaryValue: "14.80 %" },
        ],
      });

      await saturdaySlice.click({ force: true });

      await popover(page).getByText("=", { exact: true }).click();

      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("Count is equal to 2661", { exact: true }),
      ).toBeVisible();

      await page.goBack();

      await ensurePieChartRendered(
        page,
        [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ],
        ["Doohickey", "Gadget", "Gizmo", "Widget"],
      );

      // The drill fires on the wedge <path>, and hovering the label never
      // drills (the label is a leader placed off its wedge, over bare SVG). The
      // outer-ring slices share a fill with the other three categories of the
      // same day (fill = the outer variant of the day's colour, not the
      // category), and Wednesday's outer variant is #F9D45C; nth 0 within a
      // day's four slices is Doohickey (verified: it drills to Count = 603).
      // Capture that wedge up front — hovering emphasises the slice and changes
      // its fill, which would move the locator off it.
      const doohickeyWedge = pieSliceWithColor(page, "#F9D45C").first();
      const doohickeyWedgeHandle = await doohickeyWedge.elementHandle();

      await echartsContainer(page)
        .getByText("Doohickey", { exact: true })
        .first()
        .hover({ force: true });

      await assertEChartsTooltip(page, {
        header: "Wednesday",
        rows: [
          { name: "Doohickey", value: "603", secondaryValue: "21.72 %" },
          { name: "Gadget", value: "745", secondaryValue: "26.84 %" },
          { name: "Gizmo", value: "666", secondaryValue: "23.99 %" },
          { name: "Widget", value: "762", secondaryValue: "27.45 %" },
        ],
      });

      await doohickeyWedgeHandle!.click({ force: true });

      await popover(page).getByText("=", { exact: true }).click();

      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("Count is equal to 603", { exact: true }),
      ).toBeVisible();
    });
  }

  test("should apply correct filter when drilling through an 'empty' slice (VIZ-210)", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    await mb.api.put(`/api/table/${ACCOUNTS_ID}`, { visibility_type: null });
    await mb.signInAsNormalUser();

    await visitAdhoc(page, {
      display: "pie",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          aggregation: [["count"]],
          breakout: [["field", ACCOUNTS.SOURCE, { "base-type": "type/Text" }]],
          "source-table": ACCOUNTS_ID,
        },
      },
      visualization_settings: {
        "pie.show_labels": true,
      },
    });

    await echartsContainer(page).getByText("(empty)", { exact: true }).click();

    const datasetResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await popover(page).getByText("See these Accounts", { exact: true }).click();
    await datasetResponse;

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Source is empty", { exact: true }),
    ).toBeVisible();

    await assertQueryBuilderRowCount(page, 835);
  });

  test("should handle click behavior correctly", async ({ page, mb }) => {
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        query: threeRingQuery.query,
        display: "pie",
        visualization_settings: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "question/{{count}}",
          },
        },
      },
      cardDetails: {
        size_x: 30,
        size_y: 15,
      },
    });
    await visitDashboard(page, mb.api, dashboard_id);

    await confirmSliceClickBehavior(page, "2028", 6578);
    await confirmSliceClickBehavior(page, "Affiliate", 1270, 0);
    await confirmSliceClickBehavior(page, "Doohickey", 282, 0);

    await confirmSliceClickBehavior(page, "2027", 5834);
    await confirmSliceClickBehavior(page, "Organic", 1180, 1);
    await confirmSliceClickBehavior(page, "Gizmo", 354, 8);
  });

  test("should handle min percentage setting correctly", async ({
    page,
    mb,
  }) => {
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        query: threeRingQuery.query,
        display: "pie",
        visualization_settings: {
          "pie.slice_threshold": 20.6,
          "pie.percent_visibility": "inside",
          "pie.show_labels": false,
        },
      },
      cardDetails: {
        size_x: 30,
        size_y: 15,
      },
    });
    await visitDashboard(page, mb.api, dashboard_id);

    // Other slice percentage
    await echartsContainer(page)
      .getByText("79%", { exact: true })
      .hover({ force: true });

    await assertEChartsTooltip(page, {
      header: "2027",
      rows: [
        { name: "Affiliate", value: "1,046", secondaryValue: "22.68 %" },
        { name: "Google", value: "1,195", secondaryValue: "25.92 %" },
        { name: "Organic", value: "1,180", secondaryValue: "25.59 %" },
        { name: "Twitter", value: "1,190", secondaryValue: "25.81 %" },
        { name: "Total", value: "4,611", secondaryValue: "100 %" },
      ],
    });
  });

  test("should handle datasets with all negative values correctly (metabase#50692)", async ({
    page,
  }) => {
    const query = `select 'foo' x, -100 y
      union all select 'bar', -100
      union all select 'baz', -200
      union all select 'qux', -200`;

    await visitNativeAdhoc(page, {
      display: "pie",
      dataset_query: {
        type: "native",
        native: {
          query,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        "pie.show_labels": true,
      },
    });

    // Percentages should be positive
    await expect(
      page
        .getByTestId("chart-legend")
        .getByTestId("legend-item-foo")
        .getByText("16.7%", { exact: true }),
    ).toBeVisible();

    // Negative Total
    await expect(
      echartsContainer(page).getByText("-600", { exact: true }),
    ).toBeVisible();
    await echartsContainer(page)
      .getByText("qux", { exact: true })
      .hover({ force: true });

    await assertEChartsTooltip(page, {
      header: "X",
      rows: [
        { name: "foo", value: "-100", secondaryValue: "16.67 %" },
        { name: "bar", value: "-100", secondaryValue: "16.67 %" },
        { name: "baz", value: "-200", secondaryValue: "33.33 %" },
        { name: "qux", value: "-200", secondaryValue: "33.33 %" },
      ],
      footer: {
        name: "Total",
        value: "-600",
        secondaryValue: "100 %",
      },
    });
  });
});
