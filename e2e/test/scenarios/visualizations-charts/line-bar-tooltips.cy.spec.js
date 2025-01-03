import { H } from "e2e/support";
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
    H.tooltipHeader("2022");
    H.assertTooltipRow(seriesName, { color: "#88BF4D", value: "42,156.87" });
  });

  tooltipSelector("#88BF4D", 1);

  H.echartsTooltip().within(() => {
    H.tooltipHeader("2023");
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
      "2024-05-02",
      "2024-08-02",
    ],
    "source-query": {
      "source-table": 5,
      aggregation: [["sum", ["field", 40, { "base-type": "type/Float" }]]],
      breakout: [
        [
          "field",
          39,
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
    H.tooltipHeader("2022");
    H.assertTooltipRow(seriesName, {
      color: "#A989C5",
      value: "56.66",
    });
  });

  tooltipSelector("#A989C5", 1);
  H.echartsTooltip().within(() => {
    H.tooltipHeader("2022");
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
      H.tooltipHeader("2022");
      H.assertTooltipRow(seriesName, {
        color: "#88BF4D",
        value: "3,236",
      });
    });
  }

  showTooltipForCircleInSeries("#88BF4D", 1);
  H.echartsTooltip().within(() => {
    H.tooltipHeader("2023");
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
    H.tooltipHeader("2022");
    H.assertTooltipRow(seriesName, {
      color: "#509EE3",
      value: "5.03",
    });
  });

  showTooltipForCircleInSeries("#509EE3", 1);
  H.echartsTooltip().within(() => {
    H.tooltipHeader("2023");
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
    H.tooltipHeader("2022");
    H.assertTooltipRow(seriesName, {
      color: "#98D9D9",
      value: "342.09",
    });
  });

  showTooltipForCircleInSeries("#98D9D9", 1);
  H.echartsTooltip().within(() => {
    H.tooltipHeader("2023");
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
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.CATEGORY }],
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
      H.assertEChartsTooltipNotContain([SUM_OF_TOTAL, AVG_OF_QUANTITY]);

      // Go to the additional tooltip columns setting
      H.openVizSettingsSidebar();
      H.leftSidebar().within(() => {
        cy.findByText("Display").click();
        cy.findByPlaceholderText("Enter metric names").click();
      });

      // Select two additional metric columns to show in the tooltip
      cy.findByRole("option", { name: SUM_OF_TOTAL }).click();
      cy.findByRole("option", { name: AVG_OF_QUANTITY }).click();
      // It should not suggest categorical columns
      cy.findByRole("option", { name: "Product → Category" }).should(
        "not.exist",
      );

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
      }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalName = "Sum of Total";
      const customName = "Custom";

      H.cartesianChartCircle().first().realHover();
      H.assertEChartsTooltip({
        header: "2022",
        rows: [{ name: originalName, value: "42,156.87" }],
      });

      openDashCardVisualizationOptions();

      updateColumnTitle(originalName, customName);

      saveDashCardVisualizationOptions();

      H.cartesianChartCircle().first().realHover();
      H.assertEChartsTooltip({
        header: "2022",
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
      }).then(dashboardId => {
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
        header: "2022",
        rows: [
          { color: "#88BF4D", name: originalSeriesName, value: "42,156.87" },
        ],
      });

      showTooltipForCircleInSeries("#A989C5");
      H.assertEChartsTooltip({
        header: "2022",
        rows: [
          {
            color: "#A989C5",
            name: addedSeriesName,
            value: "56.66",
          },
        ],
      });

      openDashCardVisualizationOptions();

      updateColumnTitle("Q1", updatedOriginalSeriesName);
      updateColumnTitle("Q2", updatedAddedSeriesName);

      saveDashCardVisualizationOptions();

      showTooltipForCircleInSeries("#88BF4D");
      H.assertEChartsTooltip({
        header: "2022",
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
        header: "2022",
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
      }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalAvgSeriesName = "Average of Total";
      const originalCumSumSeriesName = "Cumulative sum of Quantity";
      const customAvgSeriesName = "Custom 1";
      const customCumSumSeriesName = "Custom 2";

      H.cartesianChartCircle().first().realHover();
      H.assertEChartsTooltip({
        header: "2022",
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

      openDashCardVisualizationOptions();

      updateColumnTitle(originalAvgSeriesName, customAvgSeriesName);
      updateColumnTitle(originalCumSumSeriesName, customCumSumSeriesName);

      saveDashCardVisualizationOptions();

      H.cartesianChartCircle().first().realHover();
      H.assertEChartsTooltip({
        header: "2022",
        rows: [
          {
            color: "#A989C5",
            name: customAvgSeriesName,
            value: "56.66",
          },
          {
            color: "#88BF4D",
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
    }).then(dashboardId => {
      H.visitDashboard(dashboardId);
    });
    H.cartesianChartCircleWithColor("#A989C5")
      .first()
      .as("firstCircle")
      .realHover();

    // Ensure the tooltip is visible
    H.assertEChartsTooltip({ header: "2022" });

    // Ensuring the circle is not covered by the tooltip element
    cy.get("@firstCircle").then($circle => {
      const circleRect = $circle[0].getBoundingClientRect();

      H.echartsTooltip().then($tooltip => {
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
    }).then(dashboardId => {
      H.visitDashboard(dashboardId);
    });

    H.cartesianChartCircleWithColor("#A989C5")
      .first()
      .as("firstCircle")
      .realHover();

    // Ensure the tooltip is visible
    H.assertEChartsTooltip({ header: "2022" });

    cy.get("@firstCircle").click();

    H.echartsTooltip().should("not.be.visible");
  });

  describe("> multi series question on dashboard with added question", () => {
    beforeEach(() => {
      setup({
        question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
        addedSeriesQuestion: AVG_DISCOUNT_SUM_DISCOUNT,
      }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      // Checking the second datum since the first circle of one series is covered with a circle from the other series
      const circleIndex = 1;

      const originalSeriesColors = ["#A989C5", "#88BF4D"];
      const addedSeriesColors = ["#509EE3", "#98D9D9"];
      const originalAvgSeriesName = "Q1: Average of Total";
      const originalCumSumSeriesName = "Q1: Cumulative sum of Quantity";
      const updatedOriginalAvgSeriesName = "Q1 Custom 1";
      const updatedOriginalCumSumSeriesName = "Q1 Custom 2";
      const addedAvgSeriesName = "Q2: Average of Discount";
      const addedSumSeriesName = "Q2: Sum of Discount";
      const updatedAddedAvgSeriesName = "Q2 Custom 1";
      const updatedAddedSumSeriesName = "Q2 Custom 2";

      [...originalSeriesColors, ...addedSeriesColors].forEach(color => {
        showTooltipForCircleInSeries(color, circleIndex);
        H.assertEChartsTooltip({
          header: "2023",
          rows: [
            {
              color: originalSeriesColors[0],
              name: originalAvgSeriesName,
              value: "56.86",
            },
            {
              color: originalSeriesColors[1],
              name: originalCumSumSeriesName,
              value: "17,587",
            },
            {
              color: addedSeriesColors[0],
              name: addedAvgSeriesName,
              value: "5.41",
            },
            {
              color: addedSeriesColors[1],
              name: addedSumSeriesName,
              value: "1,953.08",
            },
          ],
        });
      });

      openDashCardVisualizationOptions();

      updateColumnTitle(originalAvgSeriesName, updatedOriginalAvgSeriesName);
      updateColumnTitle(
        originalCumSumSeriesName,
        updatedOriginalCumSumSeriesName,
      );

      updateColumnTitle(addedAvgSeriesName, updatedAddedAvgSeriesName);
      updateColumnTitle(addedSumSeriesName, updatedAddedSumSeriesName);

      saveDashCardVisualizationOptions();

      [...originalSeriesColors, ...addedSeriesColors].forEach(color => {
        showTooltipForCircleInSeries(color, circleIndex);
        H.assertEChartsTooltip({
          header: "2023",
          rows: [
            {
              color: originalSeriesColors[0],
              name: updatedOriginalAvgSeriesName,
              value: "56.86",
            },
            {
              color: originalSeriesColors[1],
              name: updatedOriginalCumSumSeriesName,
              value: "17,587",
            },
            {
              color: addedSeriesColors[0],
              name: updatedAddedAvgSeriesName,
              value: "5.41",
            },
            {
              color: addedSeriesColors[1],
              name: updatedAddedSumSeriesName,
              value: "1,953.08",
            },
          ],
        });
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
      }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalName = "Sum of Total";
      const updatedName = "Custom";

      H.chartPathWithFillColor("#88BF4D").first().realHover();
      H.assertEChartsTooltip({
        header: "2022",
        rows: [
          {
            color: "#88BF4D",
            name: originalName,
            value: "42,156.87",
          },
        ],
      });

      openDashCardVisualizationOptions();

      updateColumnTitle(originalName, updatedName);

      saveDashCardVisualizationOptions();

      H.chartPathWithFillColor("#88BF4D").first().realHover();
      H.assertEChartsTooltip({
        header: "2022",
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
      }).then(dashboardId => {
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
        header: "2022",
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
        header: "2022",
        rows: [
          {
            color: "#A989C5",
            name: addedSeriesName,
            value: "56.66",
          },
        ],
      });

      openDashCardVisualizationOptions();

      updateColumnTitle(originalSeriesName, updatedOriginalSeriesName);
      updateColumnTitle(addedSeriesName, updatedAddedSeriesName);

      saveDashCardVisualizationOptions();

      showTooltipForBarInSeries(originalSeriesColor, 0);
      H.assertEChartsTooltip({
        header: "2022",
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
        header: "2022",
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
      }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D", 0);
      H.assertEChartsTooltip({
        header: "April 2022",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "52.76",
          },
        ],
      });
      testTooltipExcludesText("Compared to previous month");

      showTooltipForCircleInSeries("#88BF4D", 1);
      H.assertEChartsTooltip({
        header: "May 2022",
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
      }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D", 0);
      H.assertEChartsTooltip({
        header: "April 2022",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "52.76",
          },
        ],
      });
      testTooltipExcludesText("Compared to previous month");
      showTooltipForCircleInSeries("#88BF4D", 1);
      H.assertEChartsTooltip({
        header: "June 2022",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "2,072.94",
          },
        ],
      });
      testTooltipExcludesText("Compared to previous month");

      showTooltipForCircleInSeries("#88BF4D", 2);
      H.assertEChartsTooltip({
        header: "July 2022",
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
        header: "September 2022",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "5,372.08",
          },
        ],
      });
      testTooltipExcludesText("Compared to previous month");
    });

    it("should not show if x-axis is not timeseries", () => {
      setup({
        question: SUM_OF_TOTAL_MONTH_ORDINAL,
      }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D", 0);
      H.assertEChartsTooltip({
        header: "April 2022",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "52.76",
          },
        ],
      });
      testTooltipExcludesText("Compared to previous month");

      showTooltipForCircleInSeries("#88BF4D", 1);
      H.assertEChartsTooltip({
        header: "May 2022",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "1,265.72",
          },
        ],
      });

      testTooltipExcludesText("Compared to previous month");
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
          ["field", 39, { "base-type": "type/DateTime" }],
          "2024-01-01",
          "2024-05-30",
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
          ["field", 39, { "base-type": "type/DateTime" }],
          "2024-03-01",
          "2024-03-31",
        ],
      },
      display: "line",
    };

    const DST_WEEK_CHANGES = [null, "+191.48%", "+4.76%", "-2.36%"];

    const SUM_OF_TOTAL_DST_DAY = {
      name: "Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }]],
        filter: [
          "between",
          ["field", 39, { "base-type": "type/DateTime" }],
          "2024-03-09",
          "2024-03-12",
        ],
      },
      display: "line",
    };

    const DST_DAY_CHANGES = [null, "+27.5%", "-26.16%"];

    it("should not omit percent change on April", () => {
      setup({ question: SUM_OF_TOTAL_APRIL }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });

      APRIL_CHANGES.forEach((change, index) => {
        showTooltipForCircleInSeries("#88BF4D", index);
        if (change === null) {
          testTooltipExcludesText("Compared to previous");
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
      setup({ question: SUM_OF_TOTAL_DST_WEEK }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });

      DST_WEEK_CHANGES.forEach((change, index) => {
        showTooltipForCircleInSeries("#88BF4D", index);
        if (change === null) {
          testTooltipExcludesText("Compared to previous");
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
      setup({ question: SUM_OF_TOTAL_DST_DAY }).then(dashboardId => {
        H.visitDashboard(dashboardId);
      });

      DST_DAY_CHANGES.forEach((change, index) => {
        showTooltipForCircleInSeries("#88BF4D", index);
        if (change === null) {
          testTooltipExcludesText("Compared to previous");
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
  return cy.createQuestion(question).then(({ body: { id: card1Id } }) => {
    if (addedSeriesQuestion) {
      cy.createQuestion(addedSeriesQuestion).then(
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
  return cy.createDashboard().then(({ body: { id: dashboardId } }) => {
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
function resetHoverState() {
  H.echartsTriggerBlur();
  cy.wait(50);
}

function showTooltipForCircleInSeries(seriesColor, index = 0) {
  resetHoverState();
  H.cartesianChartCircleWithColor(seriesColor).eq(index).realHover();
}

function showTooltipForBarInSeries(seriesColor, index = 0) {
  resetHoverState();
  H.chartPathWithFillColor(seriesColor).eq(index).realHover();
}

function testTooltipExcludesText(text) {
  H.echartsTooltip().within(() => {
    cy.contains(text).should("not.exist");
  });
}

function openDashCardVisualizationOptions() {
  cy.icon("pencil").click();
  cy.findByTestId("dashcard").realHover();
  cy.icon("palette").click();
}

function updateColumnTitle(originalText, updatedText) {
  cy.findByDisplayValue(originalText).clear().type(updatedText).blur();
}

function saveDashCardVisualizationOptions() {
  H.modal().within(() => {
    cy.findByText("Done").click();
  });

  H.saveDashboard();
}
