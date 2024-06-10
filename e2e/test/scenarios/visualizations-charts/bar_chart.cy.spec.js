import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitQuestionAdhoc,
  sidebar,
  getDraggableElements,
  popover,
  visitDashboard,
  cypressWaitAll,
  moveDnDKitElement,
  chartPathWithFillColor,
  echartsContainer,
  getValueLabels,
  createQuestion,
  chartPathsWithFillColors,
  createNativeQuestion,
  testStackedTooltipRows,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > bar chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("with numeric dimension", () => {
    const query = `
      select null as "a", 10 as "b" union all
      select 5 as "a", 2 as "b" union all
      select 0 as "a", 1 as "b"
    `;

    function getQuestion(visualizationSettings) {
      return {
        dataset_query: {
          type: "native",
          native: { query, "template-tags": {} },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: visualizationSettings,
      };
    }

    it("should not show a bar for null values (metabase#12138)", () => {
      visitQuestionAdhoc(
        getQuestion({
          "graph.dimensions": ["a"],
          "graph.metrics": ["b"],
        }),
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("(empty)").should("not.exist");
    });

    it("should show an (empty) bar for null values when X axis is ordinal (metabase#12138)", () => {
      visitQuestionAdhoc(
        getQuestion({
          "graph.dimensions": ["a"],
          "graph.metrics": ["b"],
          "graph.x_axis.scale": "ordinal",
        }),
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("(empty)");
    });
  });

  describe("with binned dimension (histogram)", () => {
    it("should filter out null values (metabase#16049)", () => {
      visitQuestionAdhoc({
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

      chartPathWithFillColor("#509EE3").should("have.length", 5); // there are six bars when null isn't filtered
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1,800"); // correct data has this on the y-axis
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("16,000").should("not.exist"); // If nulls are included the y-axis stretches much higher
    });
  });

  describe("with very low and high values", () => {
    it("should display correct data values", () => {
      visitQuestionAdhoc({
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

      echartsContainer()
        .get("text")
        .should("contain", "19")
        .and("contain", "20.0M");
    });
  });

  describe("with x-axis series", () => {
    beforeEach(() => {
      visitQuestionAdhoc({
        display: "bar",
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
              [
                "field",
                PRODUCTS.CATEGORY,
                { "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
          },
          database: SAMPLE_DB_ID,
        },
      });

      cy.findByTestId("viz-settings-button").click();
      sidebar().findByText("Data").click();
    });

    it("should allow you to show/hide and reorder columns", () => {
      moveDnDKitElement(getDraggableElements().eq(0), { vertical: 100 });

      cy.findAllByTestId("legend-item").eq(0).should("contain.text", "Gadget");
      cy.findAllByTestId("legend-item").eq(1).should("contain.text", "Gizmo");
      cy.findAllByTestId("legend-item")
        .eq(2)
        .should("contain.text", "Doohickey");
      cy.findAllByTestId("legend-item").eq(3).should("contain.text", "Widget");

      const columnIndex = 1;

      getDraggableElements()
        .eq(columnIndex)
        .within(() => {
          cy.icon("eye_outline").click();
        });

      getDraggableElements()
        .eq(columnIndex)
        .invoke("text")
        .then(columnName => {
          cy.findByTestId("query-visualization-root")
            .findByText(columnName)
            .should("not.exist");
          cy.findAllByTestId("legend-item").should("have.length", 3);
          chartPathWithFillColor("#F2A86F").should("be.visible");
          chartPathWithFillColor("#F9D45C").should("be.visible");
          chartPathWithFillColor("#88BF4D").should("be.visible");
        });

      getDraggableElements()
        .eq(columnIndex)
        .within(() => {
          cy.icon("eye_crossed_out").click();
        });

      getDraggableElements()
        .eq(columnIndex)
        .invoke("text")
        .then(columnName => {
          cy.findByTestId("query-visualization-root")
            .findByText(columnName)
            .should("exist");
          cy.findAllByTestId("legend-item").should("have.length", 4);
          chartPathWithFillColor("#F2A86F").should("be.visible");
          chartPathWithFillColor("#F9D45C").should("be.visible");
          chartPathWithFillColor("#88BF4D").should("be.visible");
          chartPathWithFillColor("#A989C5").should("be.visible");
        });

      cy.findAllByTestId("legend-item").contains("Gadget").click();
      popover().findByText("See these Orders").click();
      cy.findByTestId("qb-filters-panel")
        .findByText("Product → Category is Gadget")
        .should("exist");
    });

    it("should gracefully handle removing filtered items, and adding new items to the end of the list", () => {
      moveDnDKitElement(getDraggableElements().first(), { vertical: 100 });

      getDraggableElements()
        .eq(1)
        .within(() => {
          cy.icon("eye_outline").click();
        });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Filter").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Product").click();

      cy.findByTestId("filter-column-Category").within(() => {
        cy.findByLabelText("Filter operator").click();
      });

      popover().within(() => {
        cy.findByText("Is not").click();
      });

      cy.findByTestId("filter-column-Category").within(() => {
        cy.findByText("Gadget").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Apply filters").click();

      getDraggableElements().should("have.length", 3);

      //Ensures that "Gizmo" is still hidden, so it's state hasn't changed.
      getDraggableElements()
        .eq(0)
        .within(() => {
          cy.icon("eye_crossed_out").click();
        });

      cy.findByTestId("qb-filters-panel").within(() => {
        cy.icon("close").click();
      });

      getDraggableElements().should("have.length", 4);

      //Re-added items should appear at the end of the list.
      getDraggableElements().eq(0).should("have.text", "Gizmo");
      getDraggableElements().eq(3).should("have.text", "Gadget");
    });
  });

  // Note (EmmadUsmani): see `line_chart.cy.spec.js` for more test cases of this
  describe("with split y-axis (metabase#12939)", () => {
    it("should split the y-axis when column settings differ", () => {
      visitQuestionAdhoc({
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

      echartsContainer().within(() => {
        cy.get("text").contains("Average of Total").should("be.visible");
        cy.get("text").contains("Min of Total").should("be.visible");
      });
    });

    it("should not split the y-axis when semantic_type, column settings are same and values are not far", () => {
      visitQuestionAdhoc({
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

      cy.get("g.axis.yr").should("not.exist");
    });

    it("should split the y-axis on native queries with two numeric columns", () => {
      visitQuestionAdhoc({
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

      echartsContainer().within(() => {
        cy.get("text").contains("m1").should("exist");
        cy.get("text").contains("m2").should("exist");
      });
    });
  });

  describe("with stacked bars", () => {
    it("should drill-through correctly when stacking", () => {
      visitQuestionAdhoc({
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

      cy.findAllByTestId("legend-item").findByText("Doohickey").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See these Products").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Category is Doohickey").should("be.visible");
    });
  });

  it("supports up to 100 series (metabase#28796)", () => {
    visitQuestionAdhoc({
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

    cy.findByTestId("viz-settings-button").click();
    cy.get("[data-testid^=draggable-item]").should("have.length", 100);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ID is less than 101").click();
    cy.findByDisplayValue("101").type("{backspace}2");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Update filter").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "This chart type doesn't support more than 100 series of data.",
    );
    cy.get("[data-testid^=draggable-item]").should("have.length", 0);
  });

  it("should support showing data points with > 10 series (#33725)", () => {
    cy.signInAsAdmin();
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
      "2023-09-01",
      "2023-09-30",
    ];

    const avgTotalByMonth = {
      name: "Average Total by Month",
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["avg", ["field", ORDERS.TOTAL]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "line",
    };

    const sumTotalByMonth = {
      name: "Sum Total by Month",
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "line",
    };

    const multiMetric = {
      name: "Should split",
      type: "query",
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
      type: "query",
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

    cy.createDashboardWithQuestions({
      dashboardName: "Split Test Dashboard",
      questions: [multiMetric],
    }).then(({ dashboard }) => {
      cy.createQuestion(sumTotalByMonth, { wrapId: true }).then(() => {
        cy.get("@questionId").then(questionId => {
          cypressWaitAll([
            cy.createQuestionAndAddToDashboard(avgTotalByMonth, dashboard.id, {
              series: [
                {
                  id: questionId,
                },
              ],
              col: 12,
              row: 0,
              visualization_settings: {
                "card.title": "Multi Series",
              },
            }),
            cy.createQuestionAndAddToDashboard(breakoutQuestion, dashboard.id, {
              col: 0,
              row: 9,
              size_x: 20,
            }),
          ]).then(() => {
            visitDashboard(dashboard.id);
          });
        });
      });
    });

    //This card is testing #33725 now, as the changes made for #34618 would cause "Should not Split" to no longer split and error
    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Should split")
      .within(() => {
        // Verify this axis tick exists twice which verifies there are two y-axes
        echartsContainer().findAllByText("3.0k").should("have.length", 2);
      });

    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Multi Series")
      .within(() => {
        echartsContainer().findByText("Average Total by Month");
        echartsContainer().findByText("Sum Total by Month");
      });

    cy.log("Should not produce a split axis graph (#34618)");
    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Should not Split")
      .within(() => {
        getValueLabels()
          .should("contain", "6")
          .and("contain", "13")
          .and("contain", "19");
        cy.get(".axis.yr").should("not.exist");
      });
  });

  it("should correctly handle bar sizes and tool-tips for multiple y-axis metrics with column scaling  (#43536)", () => {
    cy.signInAsAdmin();

    const column_settings = { '["name","sum"]': { scale: 0.5 } };
    const multiMetric = {
      name: "Should split",
      type: "query",
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

    createQuestion(multiMetric, { visitQuestion: true });

    const [firstMetric, secondMetric] = chartPathsWithFillColors([
      "#88BF4D",
      "#98D9D9",
    ]);
    firstMetric.then($metricOne => {
      const { height: heightMetricOne } = $metricOne[0].getBoundingClientRect();
      secondMetric.then($metricTwo => {
        const { height: heightMetricTwo } =
          $metricTwo[0].getBoundingClientRect();

        // since the first metric is scaled to be half of the second metric
        // the first bar should be half the size of the first bar
        // within a given tolerance
        expect(heightMetricOne - heightMetricTwo / 2).to.be.lessThan(0.1);
      });
    });

    chartPathWithFillColor("#88BF4D").first().realHover();
    popover().within(() => {
      cy.contains("Sum of Total");
      // half of the unscaled metric
      cy.contains("21,078.43");
      // full value of the unscale metric
      cy.contains("42,156.87");
    });
  });

  it("should correctly show tool-tips when stacked bar charts contain a total value that is negative (#39012)", () => {
    cy.signInAsAdmin();

    createNativeQuestion(
      {
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
      },
      { visitQuestion: true },
    );

    chartPathWithFillColor("#A989C5").eq(0).realHover();
    testStackedTooltipRows([
      ["blue", "2", "20.00 %"],
      ["yellow", "8", "80.00 %"],
      ["Total", "10", "100 %"],
    ]);
    resetHoverState();

    chartPathWithFillColor("#A989C5").eq(1).realHover();
    testStackedTooltipRows([
      ["blue", "-16", "-200.00 %"],
      ["yellow", "8", "100 %"],
      ["Total", "-8", "-100.00 %"],
    ]);
    resetHoverState();

    chartPathWithFillColor("#A989C5").eq(2).realHover();
    testStackedTooltipRows([
      ["blue", "-7", "-350.00 %"],
      ["yellow", "5", "250.00 %"],
      ["Total", "-2", "-100.00 %"],
    ]);
    resetHoverState();

    chartPathWithFillColor("#A989C5").eq(3).realHover();
    testStackedTooltipRows([
      ["blue", "2", "Infinity %"],
      ["yellow", "-2", "-Infinity %"],
      ["Total", "0", "NaN %"],
    ]);
    resetHoverState();

    chartPathWithFillColor("#A989C5").eq(4).realHover();
    testStackedTooltipRows([
      ["blue", "3", "300.00 %"],
      ["yellow", "-2", "-200.00 %"],
      ["Total", "1", "100 %"],
    ]);
    resetHoverState();
  });
});

function resetHoverState() {
  cy.findByTestId("main-logo").realHover();
}
