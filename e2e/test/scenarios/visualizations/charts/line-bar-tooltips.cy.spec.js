const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const SUM_OF_TOTAL = {
  name: "Q1",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

function testSumTotalChange(
  tooltipSelector = showTooltipForCircleInSeries,
  seriesName = "Sum of Total",
) {
  tooltipSelector("#88BF4D", 0);
  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2025");
    H.assertTooltipRow(seriesName, { color: "#88BF4D", value: "42,156.87" });
  });

  tooltipSelector("#88BF4D", 1);

  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2026");
    H.assertTooltipRow(seriesName, {
      color: "#88BF4D",
      value: "205,256.02",
      secondaryValue: "+386.89%",
    });
  });
}

const SUM_OF_TOTAL_MONTH = {
  name: "Q1",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  display: "line",
};

const SUM_OF_TOTAL_MONTH_EXCLUDE_MAY_AUG = {
  ...SUM_OF_TOTAL_MONTH,
  query: {
    filter: [
      "!=",
      [
        "field",
        "CREATED_AT",
        {
          "base-type": "type/DateTime",
          "temporal-unit": "month-of-year",
        },
      ],
      "2027-05-02",
      "2027-08-02",
    ],
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
  },
};

const SUM_OF_TOTAL_MONTH_ORDINAL = {
  ...SUM_OF_TOTAL_MONTH,
  visualization_settings: { "graph.x_axis.scale": "ordinal" },
};

const AVG_OF_TOTAL = {
  name: "Q2",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

function testAvgTotalChange(
  tooltipSelector = showTooltipForCircleInSeries,
  seriesName = "Average of Total",
) {
  tooltipSelector("#A989C5", 0);
  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2025");
    H.assertTooltipRow(seriesName, {
      color: "#A989C5",
      value: "56.66",
    });
  });

  tooltipSelector("#A989C5", 1);
  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2026");
    H.assertTooltipRow(seriesName, {
      color: "#A989C5",
      value: "56.86",
      secondaryValue: "+0.34%",
    });
  });
}

const AVG_OF_TOTAL_CUM_SUM_QUANTITY = {
  name: "Q1",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["avg", ["field", ORDERS.TOTAL, null]],
      ["cum-sum", ["field", ORDERS.QUANTITY, null]],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

function testCumSumChange(
  testFirstTooltip = true,
  seriesName = "Cumulative sum of Quantity",
) {
  // In the multi series question with added question spec, this first circle
  // ends up hidden behind another circle, so we'll just skip it in that
  // specific spec
  if (testFirstTooltip) {
    showTooltipForCircleInSeries("#88BF4D", 0);
    H.echartsTooltip().within(() => {
      H.tooltipHeader().should("have.text", "2025");
      H.assertTooltipRow(seriesName, {
        color: "#88BF4D",
        value: "3,236",
      });
    });
  }

  showTooltipForCircleInSeries("#88BF4D", 1);
  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2026");
    H.assertTooltipRow(seriesName, {
      color: "#88BF4D",
      value: "17,587",
      secondaryValue: "+443.48%",
    });
  });
}

const AVG_DISCOUNT_SUM_DISCOUNT = {
  name: "Q2",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["avg", ["field", ORDERS.DISCOUNT, null]],
      ["sum", ["field", ORDERS.DISCOUNT, null]],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

function testAvgDiscountChange(seriesName = "Average of Discount") {
  showTooltipForCircleInSeries("#509EE3", 0);
  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2025");
    H.assertTooltipRow(seriesName, {
      color: "#509EE3",
      value: "5.03",
    });
  });

  showTooltipForCircleInSeries("#509EE3", 1);
  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2026");
    H.assertTooltipRow(seriesName, {
      color: "#509EE3",
      value: "5.41",
      secondaryValue: "+7.54%",
    });
  });
}

function testSumDiscountChange(seriesName = "Sum of Discount") {
  showTooltipForCircleInSeries("#98D9D9", 0);
  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2025");
    H.assertTooltipRow(seriesName, {
      color: "#98D9D9",
      value: "342.09",
    });
  });

  showTooltipForCircleInSeries("#98D9D9", 1);
  H.echartsTooltip().within(() => {
    H.tooltipHeader().should("have.text", "2026");
    H.assertTooltipRow(seriesName, {
      color: "#98D9D9",
      value: "1,953.08",
      secondaryValue: "+470.93%",
    });
  });
}

describe("scenarios > visualizations > line/bar chart > tooltips", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be enterable and scrollable to view all rows in long tooltips (metabase#53586) (metabase#48347)", () => {
    const testQuestion = {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            [
              "field",
              ORDERS.TOTAL,
              { binning: { strategy: "num-bins", "num-bins": 50 } },
            ],
          ],
        },
        type: "query",
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "TOTAL"],
        "graph.metrics": ["count"],
      },
    };
    H.visitQuestionAdhoc(testQuestion);

    showTooltipForBarInSeries("#A989C5", 3);
    H.echartsTooltip()
      .findByText("155 – 160") // bottom row
      .scrollIntoView()
      .should("be.visible");
  });

  it("should show correct tooltips for interpolated data points (metabase#47757)", () => {
    H.visitQuestionAdhoc({
      visualization_settings: {
        "graph.dimensions": ["X"],
        "graph.metrics": ["Y"],
        series_settings: { Y: { "line.missing": "zero" } },
      },
      dataset_query: {
        type: "native",
        native: {
          query: `select '2020-01-01' x, 10 y
union all select '2020-03-01' x, 30 y
union all select '2020-04-01' x, 40 y`,
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    H.cartesianChartCircleWithColor("#88BF4D").eq(0).trigger("mousemove");
    H.assertEChartsTooltip({
      header: "January 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 10,
        },
      ],
      footer: null,
      blurAfter: true,
    });

    H.cartesianChartCircleWithColor("#88BF4D").eq(1).trigger("mousemove");
    H.assertEChartsTooltip({
      header: "February 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 0,
          secondaryValue: "-100%",
        },
      ],
      footer: null,
      blurAfter: true,
    });

    H.cartesianChartCircleWithColor("#88BF4D").eq(2).trigger("mousemove");
    H.assertEChartsTooltip({
      header: "March 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 30,
          secondaryValue: "+∞%",
        },
      ],
      footer: null,
      blurAfter: true,
    });
  });

  it("should wrap long values without expanding the tooltip beyond the viewport (metabase#68337)", () => {
    const longTooltipValue = "a".repeat(10000);

    H.visitQuestionAdhoc({
      display: "line",
      dataset_query: {
        type: "native",
        native: {
          query: `select 1 as x, 10 as metric_value, '${longTooltipValue}' as details
union all select 2, 20, 'short value'`,
        },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        "graph.dimensions": ["X"],
        "graph.metrics": ["METRIC_VALUE"],
        "graph.tooltip_columns": [JSON.stringify(["name", "DETAILS"])],
      },
    });

    H.cartesianChartCircle()
      .should("have.length", 2)
      .first()
      .trigger("mousemove");

    cy.window().then((appWindow) => {
      H.echartsTooltip().then(($tooltip) => {
        const tooltipRoot = $tooltip[0].parentElement;
        expect(tooltipRoot).not.to.be.null;
        if (tooltipRoot == null) {
          return;
        }

        const tooltipBounds = tooltipRoot.getBoundingClientRect();

        expect(tooltipBounds.left).to.be.at.least(0);
        expect(tooltipBounds.right).to.be.at.most(appWindow.innerWidth);
        expect(tooltipBounds.height).to.be.at.most(appWindow.innerHeight * 0.8);
        expect(tooltipRoot.scrollHeight).to.be.greaterThan(
          tooltipRoot.clientHeight,
        );
      });
    });

    H.echartsTooltip()
      .findByText(longTooltipValue)
      .should(($value) => {
        const value = $value[0];
        const fontSize = Number.parseFloat(getComputedStyle(value).fontSize);

        expect(value.scrollWidth).to.be.at.most(value.clientWidth);
        expect(value.clientHeight).to.be.greaterThan(fontSize * 2);
      });
  });

  it("should use time formatting settings in tooltips for native questions (metabase#11435)", () => {
    const questionDetails = {
      name: "11435",
      display: "line",
      native: {
        query: `
  SELECT "PUBLIC"."ORDERS"."ID" AS "ID", "PUBLIC"."ORDERS"."USER_ID" AS "USER_ID", "PUBLIC"."ORDERS"."PRODUCT_ID" AS "PRODUCT_ID", "PUBLIC"."ORDERS"."SUBTOTAL" AS "SUBTOTAL", "PUBLIC"."ORDERS"."TAX" AS "TAX", "PUBLIC"."ORDERS"."TOTAL" AS "TOTAL", "PUBLIC"."ORDERS"."DISCOUNT" AS "DISCOUNT", "PUBLIC"."ORDERS"."CREATED_AT" AS "CREATED_AT", "PUBLIC"."ORDERS"."QUANTITY" AS "QUANTITY"
  FROM "PUBLIC"."ORDERS"
  WHERE ("PUBLIC"."ORDERS"."CREATED_AT" >= timestamp with time zone '2028-03-12 00:00:00.000+03:00'
         AND "PUBLIC"."ORDERS"."CREATED_AT" < timestamp with time zone '2028-03-13 00:00:00.000+03:00')
  LIMIT 1048575`,
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["TOTAL"],
        column_settings: {
          '["name","CREATED_AT"]': {
            time_enabled: "milliseconds",
          },
        },
      },
    };

    H.createNativeQuestion(questionDetails, { visitQuestion: true });
    H.cartesianChartCircle().eq(1).realHover();
    H.assertEChartsTooltip({
      header: "March 11, 2028, 5:55:36.759 PM",
      rows: [
        {
          color: "#F9D45C",
          name: "TOTAL",
          value: "135.23",
        },
      ],
    });
  });

  describe("> additional columns setting", () => {
    const COUNT = "Count";
    const SUM_OF_TOTAL = "Sum of Total";
    const AVG_OF_QUANTITY = "Average of Quantity";

    const COUNT_COLOR = "#509EE3";
    const DOOHICKEY_COLOR = "#88BF4D";

    const testQuestion = {
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
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        type: "query",
      },
      display: "bar",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count"],
      },
    };

    it("should allow adding non-series columns from data to the tooltip", () => {
      H.visitQuestionAdhoc(testQuestion);

      // Tooltip by default shows only visible series data
      showTooltipForBarInSeries(COUNT_COLOR);
      H.assertEChartsTooltip({
        header: "0",
        rows: [{ name: COUNT, value: "2,308" }],
      });
      H.assertEChartsTooltipNotContain([SUM_OF_TOTAL, AVG_OF_QUANTITY]);

      // Go to the additional tooltip columns setting
      H.openVizSettingsSidebar();
      H.leftSidebar().within(() => {
        cy.findByText("Display").click();
        cy.findByPlaceholderText("Enter column names").click();
      });

      // Select two additional columns to show in the tooltip
      cy.findByRole("option", { name: SUM_OF_TOTAL }).click();
      cy.findByRole("option", { name: AVG_OF_QUANTITY }).click();
      // It should suggest categorical columns as well
      cy.findByRole("option", { name: "Product → Category" }).should("exist");

      // Ensure the tooltip shows additional columns
      showTooltipForBarInSeries(COUNT_COLOR);
      H.assertEChartsTooltip({
        header: "0",
        rows: [
          { name: COUNT, value: "2,308" },
          { name: SUM_OF_TOTAL, value: "179,762.63" },
          { name: AVG_OF_QUANTITY, value: "15.32" },
        ],
      });

      // Add a breakout to the chart
      H.leftSidebar().within(() => {
        cy.findByText("Data").click();
        cy.findByText("Add series breakout").click();
      });

      // Ensure the tooltip still shows additional columns
      showTooltipForBarInSeries(DOOHICKEY_COLOR);
      const assertBreakoutTooltip = () => {
        H.assertEChartsTooltip({
          header: "0",
          rows: [
            { name: "Doohickey", value: "192" },
            { name: SUM_OF_TOTAL, value: "20,345.44" },
            { name: AVG_OF_QUANTITY, value: "3.76" },
            { name: "Gadget", value: "653" },
            { name: "Gizmo", value: "370" },
            { name: "Widget", value: "1,093" },
          ],
        });
      };
      assertBreakoutTooltip();

      // Make the chart stacked
      H.leftSidebar().within(() => {
        cy.findByText("Display").click();
        cy.findByText("Stack").click();
      });

      // Ensure the tooltip still shows additional columns
      showTooltipForBarInSeries(DOOHICKEY_COLOR);
      assertBreakoutTooltip();
    });
  });

  describe("> single series question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: SUM_OF_TOTAL,
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalName = "Sum of Total";
      const customName = "Custom";

      H.cartesianChartCircle().first().trigger("mousemove");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [{ name: originalName, value: "42,156.87" }],
      });

      H.editDashboard();
      H.showDashcardVisualizerModalSettings(0, {
        isVisualizerCard: false,
      });

      updateColumnTitle(originalName, customName);

      H.saveDashcardVisualizerModalSettings();
      H.saveDashboard();

      H.cartesianChartCircle().first().trigger("mousemove");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [{ name: customName, value: "42,156.87" }],
      });
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testSumTotalChange();
    });
  });

  describe("> single series question on dashboard with added series", () => {
    beforeEach(() => {
      setup({
        question: SUM_OF_TOTAL,
        addedSeriesQuestion: AVG_OF_TOTAL,
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalSeriesName = "Q1";
      const updatedOriginalSeriesName = "Custom Q1";
      const addedSeriesName = "Q2";
      const updatedAddedSeriesName = "Custom Q2";

      showTooltipForCircleInSeries("#88BF4D");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          { color: "#88BF4D", name: originalSeriesName, value: "42,156.87" },
        ],
      });

      showTooltipForCircleInSeries("#A989C5");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#A989C5",
            name: addedSeriesName,
            value: "56.66",
          },
        ],
      });

      H.editDashboard();
      H.showDashcardVisualizerModal(0, {
        isVisualizerCard: false,
      });
      H.modal().within(() => {
        cy.button("Settings").click();
        updateColumnTitle(originalSeriesName, updatedOriginalSeriesName);
        updateColumnTitle(addedSeriesName, updatedAddedSeriesName);
      });
      // Use the helper (instead of an inline Save click) so we wait for the
      // modal to close and the dashcard change to commit. Otherwise
      // `saveDashboard()` can run before the dashboard is marked dirty and no
      // PUT /api/dashboard/* request is ever made.
      H.saveDashcardVisualizerModalSettings();
      H.saveDashboard();

      showTooltipForCircleInSeries("#88BF4D");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#88BF4D",
            name: updatedOriginalSeriesName,
            value: "42,156.87",
          },
        ],
      });

      showTooltipForCircleInSeries("#A989C5");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#A989C5",
            name: updatedAddedSeriesName,
            value: "56.66",
          },
        ],
      });
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testSumTotalChange(showTooltipForCircleInSeries, "Q1");
      testAvgTotalChange(showTooltipForCircleInSeries, "Q2");
    });
  });

  describe("> multi series question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalAvgSeriesName = "Average of Total";
      const originalCumSumSeriesName = "Cumulative sum of Quantity";
      const customAvgSeriesName = "Custom 1";
      const customCumSumSeriesName = "Custom 2";

      H.cartesianChartCircle().first().trigger("mousemove");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#A989C5",
            name: originalAvgSeriesName,
            value: "56.66",
          },
          {
            color: "#88BF4D",
            name: originalCumSumSeriesName,
            value: "3,236",
          },
        ],
      });

      H.editDashboard();
      H.showDashcardVisualizerModalSettings(0, {
        isVisualizerCard: false,
      });

      updateColumnTitle(originalAvgSeriesName, customAvgSeriesName);
      updateColumnTitle(originalCumSumSeriesName, customCumSumSeriesName);

      H.saveDashcardVisualizerModalSettings();
      H.saveDashboard();

      H.cartesianChartCircle().first().trigger("mousemove");
      // TODO also check the colors
      // TODO: VIZ-671/converting-a-multi-series-line-chart-swaps-the-series-colors
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            // color: "#A989C5",
            name: customAvgSeriesName,
            value: "56.66",
          },
          {
            // color: "#88BF4D",
            name: customCumSumSeriesName,
            value: "3,236",
          },
        ],
      });
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testAvgTotalChange();
      testCumSumChange();
    });
  });

  it("tooltips should not fully cover small dashcards", () => {
    setup({
      question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
      addedSeriesQuestion: AVG_DISCOUNT_SUM_DISCOUNT,
      cardSize: {
        x: 4,
        y: 4,
      },
    }).then((dashboardId) => {
      H.visitDashboard(dashboardId);
    });
    H.cartesianChartCircleWithColor("#A989C5")
      .first()
      .as("firstCircle")
      .trigger("mousemove");

    // Ensure the tooltip is visible
    H.assertEChartsTooltip({ header: "2025" });

    // Ensuring the circle is not covered by the tooltip element
    cy.get("@firstCircle").then(($circle) => {
      const circleRect = $circle[0].getBoundingClientRect();

      H.echartsTooltip().then(($tooltip) => {
        const tooltipRect = $tooltip[0].getBoundingClientRect();
        const isCovered =
          circleRect.top < tooltipRect.bottom &&
          circleRect.bottom > tooltipRect.top &&
          circleRect.left < tooltipRect.right &&
          circleRect.right > tooltipRect.left;

        expect(isCovered).to.be.false;
      });
    });
  });

  it("tooltips should be hidden when click popover is visible", () => {
    setup({
      question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
    }).then((dashboardId) => {
      H.visitDashboard(dashboardId);
    });

    H.cartesianChartCircleWithColor("#A989C5")
      .first()
      .as("firstCircle")
      .trigger("mousemove");

    // Ensure the tooltip is visible
    H.assertEChartsTooltip({ header: "2025" });

    cy.get("@firstCircle").click();

    H.popover().should("be.visible");
    cy.get("body").should(($body) => {
      const visibleTooltips = $body
        .find('[data-testid="echarts-tooltip"]')
        .toArray()
        .filter(H.isFixedPositionElementVisible);
      expect(visibleTooltips).to.have.length(0);
    });
  });

  describe("> multi series question on dashboard with added question", () => {
    beforeEach(() => {
      setup({
        question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
        addedSeriesQuestion: AVG_DISCOUNT_SUM_DISCOUNT,
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testAvgTotalChange(showTooltipForCircleInSeries, "Q1: Average of Total");
      testCumSumChange(false, "Q1: Cumulative sum of Quantity");
      testAvgDiscountChange("Q2: Average of Discount");
      testSumDiscountChange("Q2: Sum of Discount");
    });
  });

  describe("> bar chart question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: { ...SUM_OF_TOTAL, display: "bar" },
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalName = "Sum of Total";
      const updatedName = "Custom";

      H.chartPathWithFillColor("#88BF4D").first().trigger("mousemove");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#88BF4D",
            name: originalName,
            value: "42,156.87",
          },
        ],
      });

      H.editDashboard();
      H.showDashcardVisualizerModalSettings(0, {
        isVisualizerCard: false,
      });

      updateColumnTitle(originalName, updatedName);

      H.saveDashcardVisualizerModalSettings();
      H.saveDashboard();

      H.chartPathWithFillColor("#88BF4D").first().trigger("mousemove");
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#88BF4D",
            name: updatedName,
            value: "42,156.87",
          },
        ],
      });
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testSumTotalChange(showTooltipForBarInSeries);
    });
  });

  describe("> bar chart question on dashboard with added series", () => {
    beforeEach(() => {
      setup({
        question: { ...SUM_OF_TOTAL, display: "bar" },
        addedSeriesQuestion: { ...AVG_OF_TOTAL, display: "bar" },
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalSeriesColor = "#88BF4D";
      const addedSeriesColor = "#A989C5";
      const originalSeriesName = "Q1";
      const updatedOriginalSeriesName = "Custom Q1";
      const addedSeriesName = "Q2";
      const updatedAddedSeriesName = "Custom Q2";

      showTooltipForBarInSeries(originalSeriesColor, 0);
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#88BF4D",
            name: originalSeriesName,
            value: "42,156.87",
          },
        ],
      });

      showTooltipForBarInSeries(addedSeriesColor, 0);
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#A989C5",
            name: addedSeriesName,
            value: "56.66",
          },
        ],
      });

      H.editDashboard();
      H.showDashcardVisualizerModalSettings(0, {
        isVisualizerCard: false,
      });

      updateColumnTitle(originalSeriesName, updatedOriginalSeriesName);
      updateColumnTitle(addedSeriesName, updatedAddedSeriesName);

      H.saveDashcardVisualizerModalSettings();
      H.saveDashboard();

      showTooltipForBarInSeries(originalSeriesColor, 0);
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#88BF4D",
            name: updatedOriginalSeriesName,
            value: "42,156.87",
          },
        ],
      });

      showTooltipForBarInSeries(addedSeriesColor, 0);
      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#A989C5",
            name: updatedAddedSeriesName,
            value: "56.66",
          },
        ],
      });
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testSumTotalChange(showTooltipForBarInSeries, "Q1");
      testAvgTotalChange(showTooltipForBarInSeries, "Q2");
    });
  });

  describe("> single series question grouped by month on dashboard", () => {
    it("should show percent change in tooltip for timeseries axis", () => {
      setup({
        question: SUM_OF_TOTAL_MONTH,
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D", 0);
      H.assertEChartsTooltip({
        header: "April 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "52.76",
          },
        ],
      });
      assertNoPercentChange("Sum of Total");

      showTooltipForCircleInSeries("#88BF4D", 1);
      H.assertEChartsTooltip({
        header: "May 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "1,265.72",
            secondaryValue: "+2,299.19%",
          },
        ],
      });
    });

    it("should not show percent change when previous month is missing from result data", () => {
      setup({
        question: SUM_OF_TOTAL_MONTH_EXCLUDE_MAY_AUG,
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D", 0);
      H.assertEChartsTooltip({
        header: "April 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "52.76",
          },
        ],
      });
      assertNoPercentChange("Sum of Total");
      showTooltipForCircleInSeries("#88BF4D", 1);
      H.assertEChartsTooltip({
        header: "June 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "2,072.94",
          },
        ],
      });
      assertNoPercentChange("Sum of Total");

      showTooltipForCircleInSeries("#88BF4D", 2);
      H.assertEChartsTooltip({
        header: "July 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "3,734.69",
            secondaryValue: "+80.16%",
          },
        ],
      });

      showTooltipForCircleInSeries("#88BF4D", 3);
      H.assertEChartsTooltip({
        header: "September 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "5,372.08",
          },
        ],
      });
      assertNoPercentChange("Sum of Total");
    });

    it("should not show if x-axis is not timeseries", () => {
      setup({
        question: SUM_OF_TOTAL_MONTH_ORDINAL,
      }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D", 0);
      H.assertEChartsTooltip({
        header: "April 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "52.76",
          },
        ],
      });
      assertNoPercentChange("Sum of Total");

      showTooltipForCircleInSeries("#88BF4D", 1);
      H.assertEChartsTooltip({
        header: "May 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "1,265.72",
          },
        ],
      });

      assertNoPercentChange("Sum of Total");
    });
  });

  describe("> percent change across daylight savings time change", () => {
    const SUM_OF_TOTAL_APRIL = {
      name: "Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          "2027-01-01",
          "2027-05-30",
        ],
      },
      display: "line",
    };

    const APRIL_CHANGES = [null, "-10.89%", "+11.1%", "-2.89%"];

    const SUM_OF_TOTAL_DST_WEEK = {
      name: "Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          "2027-03-01",
          "2027-03-31",
        ],
      },
      display: "line",
    };

    const DST_WEEK_CHANGES = [null, "+27.3%", "-5.8%", "-1.36%"]; // fragile - depends on the year

    const SUM_OF_TOTAL_DST_DAY = {
      name: "Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }]],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          "2027-03-09",
          "2027-03-12",
        ],
      },
      display: "line",
    };

    const DST_DAY_CHANGES = [null, "+27.5%", "-26.16%"];

    it("should not omit percent change on April", () => {
      setup({ question: SUM_OF_TOTAL_APRIL }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      APRIL_CHANGES.forEach((change, index) => {
        showTooltipForCircleInSeries("#88BF4D", index);
        if (change === null) {
          assertNoPercentChange("Sum of Total");
          return;
        }
        H.assertEChartsTooltip({
          rows: [
            {
              color: "#88BF4D",
              name: "Sum of Total",
              secondaryValue: change,
            },
          ],
        });
      });
    });

    it("should not omit percent change the week after DST begins", () => {
      setup({ question: SUM_OF_TOTAL_DST_WEEK }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      DST_WEEK_CHANGES.forEach((change, index) => {
        showTooltipForCircleInSeries("#88BF4D", index);
        if (change === null) {
          assertNoPercentChange("Sum of Total");
          return;
        }

        H.assertEChartsTooltip({
          rows: [
            {
              color: "#88BF4D",
              name: "Sum of Total",
              secondaryValue: change,
            },
          ],
        });
      });
    });

    it("should not omit percent change the day after DST begins", () => {
      setup({ question: SUM_OF_TOTAL_DST_DAY }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      DST_DAY_CHANGES.forEach((change, index) => {
        showTooltipForCircleInSeries("#88BF4D", index);
        if (change === null) {
          assertNoPercentChange("Sum of Total");
          return;
        }
        H.assertEChartsTooltip({
          rows: [
            {
              color: "#88BF4D",
              name: "Sum of Total",
              secondaryValue: change,
            },
          ],
        });
      });
    });
  });
});

function setup({ question, addedSeriesQuestion, cardSize }) {
  return H.createQuestion(question).then(({ body: { id: card1Id } }) => {
    if (addedSeriesQuestion) {
      H.createQuestion(addedSeriesQuestion).then(
        ({ body: { id: card2Id } }) => {
          return setupDashboard(card1Id, card2Id, cardSize);
        },
      );
    } else {
      return setupDashboard(card1Id, null, cardSize);
    }
  });
}

function setupDashboard(
  cardId,
  addedSeriesCardId,
  cardSize = { x: 24, y: 12 },
) {
  return H.createDashboard().then(({ body: { id: dashboardId } }) => {
    return H.addOrUpdateDashboardCard({
      dashboard_id: dashboardId,
      card_id: cardId,
      card: {
        size_x: cardSize.x,
        size_y: cardSize.y,
        series: addedSeriesCardId ? [{ id: addedSeriesCardId }] : [],
      },
    }).then(() => {
      return dashboardId;
    });
  });
}

function showTooltipForCircleInSeries(seriesColor, index = 0) {
  H.echartsTriggerBlur();
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.cartesianChartCircleWithColor(seriesColor).eq(index).trigger("mousemove");
}

function showTooltipForBarInSeries(seriesColor, index = 0) {
  H.echartsTriggerBlur();
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.chartPathWithFillColor(seriesColor).eq(index).realHover();
}

// A row with a percent change has 4 cells: marker, name, value, change.
function assertNoPercentChange(seriesName) {
  H.echartsTooltip().within(() => {
    cy.findByText(seriesName)
      .closest("tr")
      .children("td")
      .should("have.length", 3);
    cy.findByText(/%$/).should("not.exist");
  });
}

function updateColumnTitle(originalText, updatedText) {
  cy.findByTestId("chartsettings-list-container")
    .findByDisplayValue(originalText)
    .clear()
    .type(updatedText)
    .blur();
}
