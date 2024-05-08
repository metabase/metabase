import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  visitDashboard,
  saveDashboard,
  addOrUpdateDashboardCard,
  modal,
  cartesianChartCircle,
  chartPathWithFillColor,
  cartesianChartCircleWithColor,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const SUM_OF_TOTAL = {
  name: "Q1",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

function testSumTotalChange(tooltipSelector = showTooltipForCircleInSeries) {
  tooltipSelector("#88BF4D");
  testTooltipText([
    ["Created At", "2022"],
    ["Sum of Total", "42,156.87"],
  ]);
  testTooltipExcludesText("Compared to preivous year");

  tooltipSelector("#88BF4D");
  testTooltipText([
    ["Created At", "2023"],
    ["Sum of Total", "205,256.02"],
    ["Compared to previous year", "386.89%"],
  ]);
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

function testAvgTotalChange(tooltipSelector = showTooltipForCircleInSeries) {
  tooltipSelector("#A989C5");
  testTooltipText([
    ["Created At", "2022"],
    ["Average of Total", "56.66"],
  ]);
  testTooltipExcludesText("Compared to preivous year");

  tooltipSelector("#A989C5");
  testTooltipText([
    ["Created At", "2023"],
    ["Average of Total", "56.86"],
    ["Compared to previous year", "0.34%"],
  ]);
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

function testCumSumChange(testFirstTooltip = true) {
  // In the multi series question with added question spec, this first circle
  // ends up hidden behind another circle, so we'll just skip it in that
  // specific spec
  if (testFirstTooltip) {
    showTooltipForCircleInSeries("#88BF4D");
    testTooltipText([
      ["Created At", "2022"],
      ["Cumulative sum of Quantity", "3,236"],
    ]);
    testTooltipExcludesText("Compared to preivous year");
  }

  showTooltipForCircleInSeries("#88BF4D", testFirstTooltip ? 0 : 1);
  testTooltipText([
    ["Created At", "2023"],
    ["Cumulative sum of Quantity", "17,587"],
    ["Compared to previous year", "443.48%"],
  ]);
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

function testAvgDiscountChange() {
  showTooltipForCircleInSeries("#509EE3");
  testTooltipText([
    ["Created At", "2022"],
    ["Average of Discount", "5.03"],
  ]);
  testTooltipExcludesText("Compared to preivous year");

  showTooltipForCircleInSeries("#509EE3");
  testTooltipText([
    ["Created At", "2023"],
    ["Average of Discount", "5.41"],
    ["Compared to previous year", "7.54%"],
  ]);
}

function testSumDiscountChange() {
  showTooltipForCircleInSeries("#98D9D9");
  testTooltipText([
    ["Created At", "2022"],
    ["Sum of Discount", "342.09"],
  ]);
  testTooltipExcludesText("Compared to preivous year");

  showTooltipForCircleInSeries("#98D9D9");
  testTooltipText([
    ["Created At", "2023"],
    ["Sum of Discount", "1,953.08"],
    ["Compared to previous year", "470.93%"],
  ]);
}

describe("scenarios > visualizations > line/bar chart > tooltips", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("> single series question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: SUM_OF_TOTAL,
      }).then(dashboardId => {
        visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalTooltipText = [
        ["Created At", "2022"],
        ["Sum of Total", "42,156.87"],
      ];

      const updatedTooltipText = [
        ["Created At", "2022"],
        ["Custom", "42,156.87"],
      ];

      cartesianChartCircle().first().trigger("mousemove");
      testTooltipText(originalTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle(originalTooltipText[1][0], updatedTooltipText[1][0]);

      saveDashCardVisualizationOptions();

      cartesianChartCircle().first().trigger("mousemove");
      testTooltipText(updatedTooltipText);
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
        visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalSeriesTooltipText = [
        ["Created At", "2022"],
        ["Sum of Total", "42,156.87"],
      ];
      const updatedOriginalSeriesTooltipText = [
        ["Created At", "2022"],
        ["Custom Q1", "42,156.87"],
      ];

      const addedSeriesTooltipText = [
        ["Created At", "2022"],
        ["Average of Total", "56.66"],
      ];
      const updatedAddedSeriesTooltipText = [
        ["Created At", "2022"],
        ["Custom Q2", "56.66"],
      ];

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText(originalSeriesTooltipText);

      showTooltipForCircleInSeries("#A989C5");
      testTooltipText(addedSeriesTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle("Q1", updatedOriginalSeriesTooltipText[1][0]);
      updateColumnTitle("Q2", updatedAddedSeriesTooltipText[1][0]);

      saveDashCardVisualizationOptions();

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText(updatedOriginalSeriesTooltipText);

      showTooltipForCircleInSeries("#A989C5");
      testTooltipText(updatedAddedSeriesTooltipText);
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testSumTotalChange();
      testAvgTotalChange();
    });
  });

  describe("> multi series question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
      }).then(dashboardId => {
        visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalTooltipText = [
        ["Created At", "2022"],
        ["Average of Total", "56.66"],
        ["Cumulative sum of Quantity", "3,236"],
      ];

      const updatedTooltipText = [
        ["Created At", "2022"],
        ["Custom 1", "56.66"],
        ["Custom 2", "3,236"],
      ];

      cartesianChartCircle().first().trigger("mousemove");
      testTooltipText(originalTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle(originalTooltipText[1][0], updatedTooltipText[1][0]);
      updateColumnTitle(originalTooltipText[2][0], updatedTooltipText[2][0]);

      saveDashCardVisualizationOptions();

      cartesianChartCircle().first().trigger("mousemove");
      testTooltipText(updatedTooltipText);
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testAvgTotalChange();
      testCumSumChange();
    });
  });

  describe("> multi series question on dashboard with added question", () => {
    beforeEach(() => {
      setup({
        question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
        addedSeriesQuestion: AVG_DISCOUNT_SUM_DISCOUNT,
      }).then(dashboardId => {
        visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      // Checking the second datum since the first circle of one series is covered with a circle from the other series
      const circleIndex = 1;
      const originalSeriesColors = ["#A989C5", "#88BF4D"];
      const addedSeriesColors = ["#98D9D9", "#509EE3"];
      const originalSeriesTooltipText = [
        ["Created At", "2023"],
        ["Average of Total", "56.86"],
        ["Cumulative sum of Quantity", "17,587"],
      ];
      const updatedOriginalSeriesTooltipText = [
        ["Created At", "2023"],
        ["Q1 Custom 1", "56.86"],
        ["Q1 Custom 2", "17,587"],
      ];

      const addedSeriesTooltipText = [
        ["Created At", "2023"],
        ["Average of Discount", "5.41"],
        ["Sum of Discount", "1,953.08"],
      ];
      const updatedAddedSeriesTooltipText = [
        ["Created At", "2023"],
        ["Q2 Custom 1", "5.41"],
        ["Q2 Custom 2", "1,953.08"],
      ];

      originalSeriesColors.forEach(color => {
        showTooltipForCircleInSeries(color, circleIndex);
        testTooltipText(originalSeriesTooltipText);
      });

      addedSeriesColors.forEach(color => {
        showTooltipForCircleInSeries(color, circleIndex);
        testTooltipText(addedSeriesTooltipText);
      });

      openDashCardVisualizationOptions();

      updateColumnTitle(
        `Q1: ${originalSeriesTooltipText[1][0]}`,
        updatedOriginalSeriesTooltipText[1][0],
      );
      updateColumnTitle(
        `Q1: ${originalSeriesTooltipText[2][0]}`,
        updatedOriginalSeriesTooltipText[2][0],
      );

      updateColumnTitle(
        `Q2: ${addedSeriesTooltipText[1][0]}`,
        updatedAddedSeriesTooltipText[1][0],
      );
      updateColumnTitle(
        `Q2: ${addedSeriesTooltipText[2][0]}`,
        updatedAddedSeriesTooltipText[2][0],
      );

      saveDashCardVisualizationOptions();

      originalSeriesColors.forEach(color => {
        showTooltipForCircleInSeries(color, circleIndex);
        testTooltipText(updatedOriginalSeriesTooltipText);
      });
      addedSeriesColors.forEach(color => {
        showTooltipForCircleInSeries(color, circleIndex);
        testTooltipText(updatedAddedSeriesTooltipText);
      });
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testAvgTotalChange();
      testCumSumChange(false);
      testAvgDiscountChange();
      testSumDiscountChange();
    });
  });

  describe("> bar chart question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: { ...SUM_OF_TOTAL, display: "bar" },
      }).then(dashboardId => {
        visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalTooltipText = [
        ["Created At", "2022"],
        ["Sum of Total", "42,156.87"],
      ];

      const updatedTooltipText = [
        ["Created At", "2022"],
        ["Custom", "42,156.87"],
      ];

      chartPathWithFillColor("#88BF4D").first().trigger("mousemove");
      testTooltipText(originalTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle(originalTooltipText[1][0], updatedTooltipText[1][0]);

      saveDashCardVisualizationOptions();

      chartPathWithFillColor("#88BF4D").first().trigger("mousemove");
      testTooltipText(updatedTooltipText);
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
        visitDashboard(dashboardId);
      });
    });

    it("should show updated column titles in tooltips after editing them via Visualization Options", () => {
      const originalSeriesColor = "#88BF4D";
      const addedSeriesColor = "#A989C5";
      const originalSeriesTooltipText = [
        ["Created At", "2022"],
        ["Sum of Total", "42,156.87"],
      ];
      const updatedOriginalSeriesTooltipText = [
        ["Created At", "2022"],
        ["Custom Q1", "42,156.87"],
      ];

      const addedSeriesTooltipText = [
        ["Created At", "2022"],
        ["Average of Total", "56.66"],
      ];
      const updatedAddedSeriesTooltipText = [
        ["Created At", "2022"],
        ["Custom Q2", "56.66"],
      ];

      showTooltipForFirstBarInSeries(originalSeriesColor);
      testTooltipText(originalSeriesTooltipText);

      showTooltipForFirstBarInSeries(addedSeriesColor);
      testTooltipText(addedSeriesTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle("Q1", updatedOriginalSeriesTooltipText[1][0]);
      updateColumnTitle("Q2", updatedAddedSeriesTooltipText[1][0]);

      saveDashCardVisualizationOptions();

      showTooltipForFirstBarInSeries(originalSeriesColor);
      testTooltipText(updatedOriginalSeriesTooltipText);

      showTooltipForFirstBarInSeries(addedSeriesColor);
      testTooltipText(updatedAddedSeriesTooltipText);
    });

    it("should show percent change in tooltip for timeseries axis", () => {
      testSumTotalChange(showTooltipForBarInSeries);
      testAvgTotalChange(showTooltipForBarInSeries);
    });
  });

  describe("> single series question grouped by month on dashboard", () => {
    it("should show percent change in tooltip for timeseries axis", () => {
      setup({
        question: SUM_OF_TOTAL_MONTH,
      }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText([
        ["Created At", "April 2022"],
        ["Sum of Total", "52.76"],
      ]);
      testTooltipExcludesText("Compared to preivous month");

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText([
        ["Created At", "May 2022"],
        ["Sum of Total", "1,265.72"],
        ["Compared to previous month", "2,299.19%"],
      ]);
    });

    it("should not show percent change when previous month is missing from result data", () => {
      setup({
        question: SUM_OF_TOTAL_MONTH_EXCLUDE_MAY_AUG,
      }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText([
        ["Created At", "April 2022"],
        ["Sum of Total", "52.76"],
      ]);
      testTooltipExcludesText("Compared to preivous month");

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText([
        ["Created At", "June 2022"],
        ["Sum of Total", "2,072.94"],
      ]);
      testTooltipExcludesText("Compared to preivous month");

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText([
        ["Created At", "July 2022"],
        ["Sum of Total", "3,734.69"],
        ["Compared to previous month", "80.16%"],
      ]);

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText([
        ["Created At", "September 2022"],
        ["Sum of Total", "5,372.08"],
      ]);
      testTooltipExcludesText("Compared to preivous month");
    });

    it("should not show if x-axis is not timeseries", () => {
      setup({
        question: SUM_OF_TOTAL_MONTH_ORDINAL,
      }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText([
        ["Created At", "April 2022"],
        ["Sum of Total", "52.76"],
      ]);
      testTooltipExcludesText("Compared to preivous month");

      showTooltipForCircleInSeries("#88BF4D");
      testTooltipText([
        ["Created At", "May 2022"],
        ["Sum of Total", "1,265.72"],
      ]);
      testTooltipExcludesText("Compared to preivous month");
    });
  });
});

function setup({ question, addedSeriesQuestion }) {
  return cy.createQuestion(question).then(({ body: { id: card1Id } }) => {
    if (addedSeriesQuestion) {
      cy.createQuestion(addedSeriesQuestion).then(
        ({ body: { id: card2Id } }) => {
          return setupDashboard(card1Id, card2Id);
        },
      );
    } else {
      return setupDashboard(card1Id);
    }
  });
}

function setupDashboard(cardId, addedSeriesCardId) {
  return cy.createDashboard().then(({ body: { id: dashboardId } }) => {
    return addOrUpdateDashboardCard({
      dashboard_id: dashboardId,
      card_id: cardId,
      card: {
        size_x: 24,
        size_y: 12,
        series: addedSeriesCardId ? [{ id: addedSeriesCardId }] : [],
      },
    }).then(() => {
      return dashboardId;
    });
  });
}

function showTooltipForCircleInSeries(seriesColor, index = 0) {
  cartesianChartCircleWithColor(seriesColor).eq(index).realHover();
}

function showTooltipForFirstBarInSeries(seriesColor) {
  chartPathWithFillColor(seriesColor).realHover();
}

function showTooltipForBarInSeries(seriesColor, index = 0) {
  chartPathWithFillColor(seriesColor).eq(index).realHover();
}

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1).closest("td").siblings("td").findByText(val2);
}

function testTooltipText(rowPairs = []) {
  popover().within(() => {
    rowPairs.forEach(([label, value]) => {
      testPairedTooltipValues(label, value);
    });
  });
}

function testTooltipExcludesText(text) {
  popover().within(() => {
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
  modal().within(() => {
    cy.findByText("Done").click();
  });

  saveDashboard();
}
