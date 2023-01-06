import { restore, popover, visitDashboard } from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
      const originalTooltipText = [["Sum of Total", "42,156.87"]];

      const updatedTooltipText = [["Custom", "42,156.87"]];

      const seriesIndex = 0;

      showTooltipForFirstCircleInSeries(seriesIndex);
      testTooltipContent("2016", originalTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle(originalTooltipText[0][0], updatedTooltipText[0][0]);

      saveDashCardVisualizationOptions();

      showTooltipForFirstCircleInSeries(seriesIndex);
      testTooltipContent("2016", updatedTooltipText);
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
      const originalSeriesIndex = 0;
      const addedSeriesIndex = 1;
      const originalSeriesTooltipText = [["Sum of Total", "42,156.87"]];
      const updatedOriginalSeriesTooltipText = [["Custom Q1", "42,156.87"]];

      const addedSeriesTooltipText = [["Average of Total", "56.66"]];
      const updatedAddedSeriesTooltipText = [["Custom Q2", "56.66"]];

      showTooltipForFirstCircleInSeries(originalSeriesIndex);
      testTooltipContent("2016", originalSeriesTooltipText);

      showTooltipForFirstCircleInSeries(addedSeriesIndex);
      testTooltipContent("2016", addedSeriesTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle("Q1", updatedOriginalSeriesTooltipText[0][0]);
      updateColumnTitle("Q2", updatedAddedSeriesTooltipText[0][0]);

      saveDashCardVisualizationOptions();

      showTooltipForFirstCircleInSeries(originalSeriesIndex);
      testTooltipContent("2016", updatedOriginalSeriesTooltipText);

      showTooltipForFirstCircleInSeries(addedSeriesIndex);
      testTooltipContent("2016", updatedAddedSeriesTooltipText);
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
        ["Average of Total", "56.66"],
        ["Sum of Quantity", "3,236"],
      ];

      const updatedTooltipText = [
        ["Custom 1", "56.66"],
        ["Custom 2", "3,236"],
      ];

      const seriesIndex = 0;

      showTooltipForFirstCircleInSeries(seriesIndex);
      testTooltipContent("2016", originalTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle(originalTooltipText[0][0], updatedTooltipText[0][0]);
      updateColumnTitle(originalTooltipText[1][0], updatedTooltipText[1][0]);

      saveDashCardVisualizationOptions();

      showTooltipForFirstCircleInSeries(seriesIndex);
      testTooltipContent("2016", updatedTooltipText);
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
      const originalIndices = [0, 1];
      const addedIndices = [1, 2];
      const originalSeriesTooltipText = [
        ["Average of Total", "56.66"],
        ["Sum of Quantity", "3,236"],
      ];
      const updatedOriginalSeriesTooltipText = [
        ["Q1 Custom 1", "56.66"],
        ["Q1 Custom 2", "3,236"],
      ];

      const addedSeriesTooltipText = [
        ["Average of Discount", "5.03"],
        ["Sum of Discount", "342.09"],
      ];
      const updatedAddedSeriesTooltipText = [
        ["Q2 Custom 1", "5.03"],
        ["Q2 Custom 2", "342.09"],
      ];

      originalIndices.forEach(index => {
        showTooltipForFirstCircleInSeries(index);
        testTooltipContent("2016", originalSeriesTooltipText);
      });
      addedIndices.forEach(index => {
        showTooltipForFirstCircleInSeries(index);
        testTooltipContent("2016", addedSeriesTooltipText);
      });

      openDashCardVisualizationOptions();

      updateColumnTitle(
        `Q1: ${originalSeriesTooltipText[0][0]}`,
        updatedOriginalSeriesTooltipText[0][0],
      );
      updateColumnTitle(
        `Q1: ${originalSeriesTooltipText[1][0]}`,
        updatedOriginalSeriesTooltipText[1][0],
      );

      updateColumnTitle(
        `Q2: ${addedSeriesTooltipText[0][0]}`,
        updatedAddedSeriesTooltipText[0][0],
      );
      updateColumnTitle(
        `Q2: ${addedSeriesTooltipText[1][0]}`,
        updatedAddedSeriesTooltipText[1][0],
      );

      saveDashCardVisualizationOptions();

      originalIndices.forEach(index => {
        showTooltipForFirstCircleInSeries(index);
        testTooltipContent("2016", updatedOriginalSeriesTooltipText);
      });
      addedIndices.forEach(index => {
        showTooltipForFirstCircleInSeries(index);
        testTooltipContent("2016", updatedAddedSeriesTooltipText);
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
      const originalTooltipText = [["Sum of Total", "42,156.87"]];
      const updatedTooltipText = [["Custom", "42,156.87"]];

      const seriesIndex = 0;

      showTooltipForFirstBarInSeries(seriesIndex);
      testTooltipContent("2016", originalTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle(originalTooltipText[0][0], updatedTooltipText[0][0]);

      saveDashCardVisualizationOptions();

      showTooltipForFirstBarInSeries(seriesIndex);
      testTooltipContent("2016", updatedTooltipText);
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
      const originalSeriesIndex = 0;
      const addedSeriesIndex = 1;
      const originalSeriesTooltipText = [["Sum of Total", "42,156.87"]];
      const updatedOriginalSeriesTooltipText = [["Custom Q1", "42,156.87"]];

      const addedSeriesTooltipText = [["Average of Total", "56.66"]];
      const updatedAddedSeriesTooltipText = [["Custom Q2", "56.66"]];

      showTooltipForFirstBarInSeries(originalSeriesIndex);
      testTooltipContent("2016", originalSeriesTooltipText);

      showTooltipForFirstBarInSeries(addedSeriesIndex);
      testTooltipContent("2016", addedSeriesTooltipText);

      openDashCardVisualizationOptions();

      updateColumnTitle("Q1", updatedOriginalSeriesTooltipText[0][0]);
      updateColumnTitle("Q2", updatedAddedSeriesTooltipText[0][0]);

      saveDashCardVisualizationOptions();

      showTooltipForFirstBarInSeries(originalSeriesIndex);
      testTooltipContent("2016", updatedOriginalSeriesTooltipText);

      showTooltipForFirstBarInSeries(addedSeriesIndex);
      testTooltipContent("2016", updatedAddedSeriesTooltipText);
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
    return cy
      .request("POST", `/api/dashboard/${dashboardId}/cards`, {
        cardId,
      })
      .then(({ body: { id: dashCardId } }) => {
        return cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
          cards: [
            {
              id: dashCardId,
              card_id: cardId,
              row: 0,
              col: 0,
              size_x: 18,
              size_y: 12,
              parameter_mappings: [],
              series: addedSeriesCardId ? [{ id: addedSeriesCardId }] : [],
            },
          ],
        });
      })
      .then(() => {
        return dashboardId;
      });
  });
}

function showTooltipForFirstCircleInSeries(series_index) {
  cy.get(`.sub._${series_index}`)
    .as("firstSeries")
    .find("circle")
    .first()
    .trigger("mousemove", { force: true });
}

function showTooltipForFirstBarInSeries(series_index) {
  cy.get(`.sub._${series_index}`)
    .as("firstSeries")
    .find(".bar")
    .first()
    .trigger("mousemove", { force: true });
}

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1).next("td").findByText(val2);
}

function testTooltipContent(header, rowPairs = []) {
  popover().within(() => {
    cy.findByTestId("tooltip-header").should("have.text", header);

    rowPairs.forEach(([label, value]) => {
      testPairedTooltipValues(label, value);
    });
  });
}

function openDashCardVisualizationOptions() {
  cy.icon("pencil").click();
  cy.get(".Card").realHover();
  cy.icon("palette").click();
}

function updateColumnTitle(originalText, updatedText) {
  cy.findByDisplayValue(originalText).clear().type(updatedText).blur();
}

function saveDashCardVisualizationOptions() {
  cy.get(".Modal").within(() => {
    cy.findByText("Done").click();
  });
  cy.findByText("Save").click();
}
