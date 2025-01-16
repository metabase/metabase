import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const breakoutBarChart = {
  display: "bar",
  dataset_query: {
    type: "query",
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

describe("scenarios > visualizations > bar chart", () => {
  beforeEach(() => {
    cy.restore();
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
      cy.visitQuestionAdhoc(
        getQuestion({
          "graph.dimensions": ["a"],
          "graph.metrics": ["b"],
        }),
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("(empty)").should("not.exist");
    });

    it("should show an (empty) bar for null values when X axis is ordinal (metabase#12138)", () => {
      cy.visitQuestionAdhoc(
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
      cy.visitQuestionAdhoc({
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

      cy.chartPathWithFillColor("#509EE3").should("have.length", 5); // there are six bars when null isn't filtered
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1,800"); // correct data has this on the y-axis
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("16,000").should("not.exist"); // If nulls are included the y-axis stretches much higher
    });
  });

  describe("with very low and high values", () => {
    it("should display correct data values", () => {
      cy.visitQuestionAdhoc({
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

      cy.echartsContainer()
        .get("text")
        .should("contain", "19")
        .and("contain", "20.0M");
    });
  });

  describe("with x-axis series", () => {
    beforeEach(() => {
      cy.visitQuestionAdhoc(breakoutBarChart);

      cy.openVizSettingsSidebar();
      cy.sidebar().findByText("Data").click();
    });

    it("should allow you to show/hide and reorder columns", () => {
      cy.moveDnDKitElement(cy.getDraggableElements().eq(0), { vertical: 100 });

      cy.findAllByTestId("legend-item").eq(0).should("contain.text", "Gadget");
      cy.findAllByTestId("legend-item").eq(1).should("contain.text", "Gizmo");
      cy.findAllByTestId("legend-item")
        .eq(2)
        .should("contain.text", "Doohickey");
      cy.findAllByTestId("legend-item").eq(3).should("contain.text", "Widget");

      cy.getDraggableElements().eq(1).icon("close").click({ force: true }); // Hide Gizmo

      cy.findByTestId("query-visualization-root")
        .findByText("Gizmo")
        .should("not.exist");
      cy.findAllByTestId("legend-item").should("have.length", 3);
      cy.chartPathWithFillColor("#F2A86F").should("be.visible");
      cy.chartPathWithFillColor("#F9D45C").should("be.visible");
      cy.chartPathWithFillColor("#88BF4D").should("be.visible");

      cy.leftSidebar().button("Add another series").click();
      cy.popover().findByText("Gizmo").click();

      cy.findByTestId("query-visualization-root")
        .findByText("Gizmo")
        .should("exist");
      cy.findAllByTestId("legend-item").should("have.length", 4);
      cy.chartPathWithFillColor("#F2A86F").should("be.visible");
      cy.chartPathWithFillColor("#F9D45C").should("be.visible");
      cy.chartPathWithFillColor("#88BF4D").should("be.visible");
      cy.chartPathWithFillColor("#A989C5").should("be.visible");

      cy.findAllByTestId("legend-item").contains("Gadget").click();
      cy.popover().findByText("See these Orders").click();
      cy.findByTestId("qb-filters-panel")
        .findByText("Product → Category is Gadget")
        .should("exist");
    });

    it("should gracefully handle removing filtered items, and adding new items to the end of the list", () => {
      cy.moveDnDKitElement(cy.getDraggableElements().first(), {
        vertical: 100,
      });

      cy.getDraggableElements().eq(1).icon("close").click({ force: true }); // Hide Gizmo

      cy.queryBuilderHeader().button("Filter").click();
      cy.modal().within(() => {
        cy.findByText("Product").click();
        cy.findByTestId("filter-column-Category")
          .findByLabelText("Filter operator")
          .click();
      });
      cy.popover().findByText("Is not").click();
      cy.modal().within(() => {
        cy.findByText("Product").click();
        cy.findByTestId("filter-column-Category").findByText("Gadget").click();
        cy.button("Apply filters").click();
      });

      cy.getDraggableElements().should("have.length", 2);
      cy.getDraggableElements().eq(0).should("have.text", "Doohickey");
      cy.getDraggableElements().eq(1).should("have.text", "Widget");

      cy.findByTestId("qb-filters-panel").icon("close").click();

      cy.getDraggableElements().should("have.length", 3);
      cy.getDraggableElements().eq(0).should("have.text", "Gadget");
      cy.getDraggableElements().eq(1).should("have.text", "Doohickey");
      cy.getDraggableElements().eq(2).should("have.text", "Widget");

      cy.leftSidebar().button("Add another series").click();
      cy.popover().findByText("Gizmo").click();

      cy.getDraggableElements().should("have.length", 4);
      cy.getDraggableElements().eq(0).should("have.text", "Gadget");
      cy.getDraggableElements().eq(1).should("have.text", "Gizmo");
      cy.getDraggableElements().eq(2).should("have.text", "Doohickey");
      cy.getDraggableElements().eq(3).should("have.text", "Widget");
    });
  });

  // Note (EmmadUsmani): see `line_chart.cy.spec.js` for more test cases of this
  describe("with split y-axis (metabase#12939)", () => {
    it("should split the y-axis when column settings differ", () => {
      cy.visitQuestionAdhoc({
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

      cy.echartsContainer().within(() => {
        cy.get("text").contains("Average of Total").should("be.visible");
        cy.get("text").contains("Min of Total").should("be.visible");
      });
    });

    it("should not split the y-axis when semantic_type, column settings are same and values are not far", () => {
      cy.visitQuestionAdhoc({
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
      cy.visitQuestionAdhoc({
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

      cy.echartsContainer().within(() => {
        cy.get("text").contains("m1").should("exist");
        cy.get("text").contains("m2").should("exist");
      });
    });
  });

  describe("with stacked bars", () => {
    it("should drill-through correctly when stacking", () => {
      cy.visitQuestionAdhoc({
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

  it("supports gray series colors", () => {
    const grayColor = "#F3F3F4";

    cy.visitQuestionAdhoc({
      ...breakoutBarChart,
      visualization_settings: {
        "graph.dimensions": ["CATEGORY", "SOURCE"],
        "graph.metrics": ["count"],
      },
    });

    // Ensure the gray color did not get assigned to series
    cy.chartPathWithFillColor(grayColor).should("not.exist");

    cy.openVizSettingsSidebar();

    // Open color picker for the first series
    cy.findByLabelText("#88BF4D").click();

    // Assign gray color to the first series
    cy.findByLabelText(grayColor).click();

    cy.chartPathWithFillColor(grayColor).should("be.visible");
  });

  it("supports up to 100 series (metabase#28796)", () => {
    cy.visitQuestionAdhoc({
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

    cy.openVizSettingsSidebar();
    cy.leftSidebar().button("90 more series").click();
    cy.get("[data-testid^=draggable-item]").should("have.length", 100);

    cy.findByTestId("qb-filters-panel")
      .findByText("ID is less than 101")
      .click();
    cy.popover().within(() => {
      cy.findByDisplayValue("101").type("{backspace}2");
      cy.button("Update filter").click();
    });

    cy.queryBuilderMain().findByText(
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
          cy.cypressWaitAll([
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
            cy.visitDashboard(dashboard.id);
          });
        });
      });
    });

    //This card is testing #33725 now, as the changes made for #34618 would cause "Should not Split" to no longer split and error
    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Should split")
      .within(() => {
        // Verify this axis tick exists twice which verifies there are two y-axes
        cy.echartsContainer().findAllByText("3.0k").should("have.length", 2);
      });

    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Multi Series")
      .within(() => {
        cy.echartsContainer().findByText("Average Total by Month");
        cy.echartsContainer().findByText("Sum Total by Month");
      });

    cy.log("Should not produce a split axis graph (#34618)");
    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Should not Split")
      .within(() => {
        cy.getValueLabels()
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

    cy.createQuestion(multiMetric, { visitQuestion: true });

    const [firstMetric, secondMetric] = cy.chartPathsWithFillColors([
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

    cy.chartPathWithFillColor("#88BF4D").first().realHover();
    cy.assertEChartsTooltip({
      header: "2022",
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

  it("should correctly show tool-tips when stacked bar charts contain a total value that is negative (#39012)", () => {
    cy.signInAsAdmin();

    cy.createNativeQuestion(
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

    cy.chartPathWithFillColor("#A989C5").eq(0).realHover();
    cy.assertEChartsTooltip({
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
    resetHoverState();

    cy.chartPathWithFillColor("#A989C5").eq(1).realHover();
    cy.assertEChartsTooltip({
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "-16",
          secondaryValue: "-200.00 %",
        },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "8",
          secondaryValue: "100 %",
        },
        {
          name: "Total",
          value: "-8",
          secondaryValue: "-100.00 %",
        },
      ],
    });
    resetHoverState();

    cy.chartPathWithFillColor("#A989C5").eq(2).realHover();
    cy.assertEChartsTooltip({
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "-7",
          secondaryValue: "-350.00 %",
        },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "5",
          secondaryValue: "250.00 %",
        },
        {
          name: "Total",
          value: "-2",
          secondaryValue: "-100.00 %",
        },
      ],
    });
    resetHoverState();

    cy.chartPathWithFillColor("#A989C5").eq(3).realHover();
    cy.assertEChartsTooltip({
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "2",
          secondaryValue: "Infinity %",
        },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "-2",
          secondaryValue: "-Infinity %",
        },
        {
          name: "Total",
          value: "0",
          secondaryValue: "NaN %",
        },
      ],
    });
    resetHoverState();

    cy.chartPathWithFillColor("#A989C5").eq(4).realHover();
    cy.assertEChartsTooltip({
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "3",
          secondaryValue: "300.00 %",
        },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "-2",
          secondaryValue: "-200.00 %",
        },
        {
          name: "Total",
          value: "1",
          secondaryValue: "100 %",
        },
      ],
    });
    resetHoverState();
  });

  it.skip("should allow grouping series into a single 'Other' series", () => {
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

    function setMaxCategories(value, { viaBreakoutSettings = false } = {}) {
      if (viaBreakoutSettings) {
        cy.leftSidebar().findByTestId("settings-STATE").click();
      } else {
        cy.leftSidebar().findByLabelText("Other series settings").click();
      }
      cy.popover()
        .findByTestId("graph-max-categories-input")
        .type(`{selectAll}${value}`)
        .blur();
      cy.wait(500); // wait for viz to re-render
    }

    function setOtherCategoryAggregationFn(fnName) {
      cy.leftSidebar().findByLabelText("Other series settings").click();
      cy.popover()
        .findByTestId("graph-other-category-aggregation-fn-picker")
        .click();
      cy.popover().last().findByText(fnName).click();
    }

    cy.visitQuestionAdhoc({
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
              "2022-09-01T00:00Z",
              "2023-02-01T00:00Z",
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
    cy.openVizSettingsSidebar();
    cy.leftSidebar().findByTestId("settings-STATE").click();
    cy.popover().findByLabelText("Enforce maximum number of series").click();

    // Test 'Other' series renders
    cy.otherSeriesChartPaths().should("have.length", 6);

    // Test drill-through is disabled for 'Other' series
    cy.otherSeriesChartPaths().first().click();
    cy.findByTestId("click-actions-view").should("not.exist");

    // Test drill-through is enabled for regular series
    cy.chartPathWithFillColor(AK_SERIES_COLOR).first().click();
    cy.findByTestId("click-actions-view").should("exist");

    // Test legend and series visibility toggling
    cy.queryBuilderMain()
      .findAllByTestId("legend-item")
      .should("have.length", 9)
      .last()
      .as("other-series-legend-item");
    cy.get("@other-series-legend-item").findByLabelText("Hide series").click();
    cy.otherSeriesChartPaths().should("have.length", 0);
    cy.get("@other-series-legend-item").findByLabelText("Show series").click();
    cy.otherSeriesChartPaths().should("have.length", 6);

    // Test tooltips
    cy.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
    cy.assertEChartsTooltip({ rows: [{ name: "Other", value: "9" }] });
    cy.otherSeriesChartPaths().first().realHover();
    cy.assertEChartsTooltip({
      header: "September 2022",
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
    setMaxCategories(4);
    cy.queryBuilderMain().click(); // close popover
    cy.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
    cy.echartsTooltip().find("tr").should("have.length", 5);
    cy.queryBuilderMain()
      .findAllByTestId("legend-item")
      .should("have.length", 5);

    // Test can move series in/out of "Other" series
    cy.moveDnDKitElement(cy.getDraggableElements().eq(3), { vertical: 150 }); // Move AZ into "Other"
    cy.moveDnDKitElement(cy.getDraggableElements().eq(6), { vertical: -150 }); // Move CT out of "Other"

    cy.queryBuilderMain()
      .findAllByTestId("legend-item")
      .should("have.length", 5);
    cy.queryBuilderMain()
      .findAllByTestId("legend-item")
      .contains("AZ")
      .should("not.exist");
    cy.queryBuilderMain()
      .findAllByTestId("legend-item")
      .contains("CT")
      .should("exist");

    // Test "graph.max_categories" removes "Other" altogether
    setMaxCategories(0);
    cy.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
    cy.echartsTooltip().find("tr").should("have.length", 14);
    cy.queryBuilderMain()
      .findAllByTestId("legend-item")
      .should("have.length", 14);
    cy.otherSeriesChartPaths().should("not.exist");
    setMaxCategories(8, { viaBreakoutSettings: true });

    // Test "graph.other_category_aggregation_fn" for native queries
    cy.openNotebook();
    cy.queryBuilderHeader().button("View SQL").click();
    cy.findByTestId("native-query-preview-sidebar")
      .button("Convert this question to SQL")
      .click();
    cy.wait("@dataset");
    cy.queryBuilderMain().findByTestId("visibility-toggler").click();

    cy.openVizSettingsSidebar();
    setOtherCategoryAggregationFn("Average");

    cy.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
    cy.assertEChartsTooltip({ rows: [{ name: "Other", value: "1.5" }] });

    cy.otherSeriesChartPaths().first().realHover();
    cy.assertEChartsTooltip({
      header: "September 2022",
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

    setOtherCategoryAggregationFn("Min");

    cy.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
    cy.assertEChartsTooltip({ rows: [{ name: "Other", value: "1" }] });

    cy.otherSeriesChartPaths().first().realHover();
    cy.assertEChartsTooltip({ rows: [{ name: "Min", value: "1" }] });

    setOtherCategoryAggregationFn("Max");

    cy.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
    cy.assertEChartsTooltip({ rows: [{ name: "Other", value: "3" }] });

    cy.otherSeriesChartPaths().first().realHover();
    cy.assertEChartsTooltip({ rows: [{ name: "Max", value: "3" }] });
  });
});

function resetHoverState() {
  cy.findByTestId("main-logo").realHover();
}
