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

describe("scenarios > visualizations > line/bar chart > tooltips", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("> single series question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: {
          name: "Q1",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "line",
        },
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
  });

  describe("> single series question on dashboard with added series", () => {
    beforeEach(() => {
      setup({
        question: {
          name: "Q1",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "line",
        },
        addedSeriesQuestion: {
          name: "Q2",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "line",
        },
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
  });

  describe("> multi series question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: {
          name: "Q1",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["avg", ["field", ORDERS.TOTAL, null]],
              ["cum-sum", ["field", ORDERS.QUANTITY, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "line",
        },
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
  });

  describe("> multi series question on dashboard with added question", () => {
    beforeEach(() => {
      setup({
        question: {
          name: "Q1",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["avg", ["field", ORDERS.TOTAL, null]],
              ["cum-sum", ["field", ORDERS.QUANTITY, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "line",
        },
        addedSeriesQuestion: {
          name: "Q2",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["avg", ["field", ORDERS.DISCOUNT, null]],
              ["sum", ["field", ORDERS.DISCOUNT, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "line",
        },
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
  });

  describe("> bar chart question on dashboard", () => {
    beforeEach(() => {
      setup({
        question: {
          name: "Q1",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "bar",
        },
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
  });

  describe("> bar chart question on dashboard with added series", () => {
    beforeEach(() => {
      setup({
        question: {
          name: "Q1",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "bar",
        },
        addedSeriesQuestion: {
          name: "Q2",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "bar",
        },
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
