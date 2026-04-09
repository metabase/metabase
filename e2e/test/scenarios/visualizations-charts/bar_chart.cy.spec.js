const { H } = cy;
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
    H.restore();
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
      H.visitQuestionAdhoc(
        getQuestion({
          "graph.dimensions": ["a"],
          "graph.metrics": ["b"],
        }),
      );

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("(empty)").should("not.exist");
    });

    it("should show an (empty) bar for null values when X axis is ordinal (metabase#12138)", () => {
      H.visitQuestionAdhoc(
        getQuestion({
          "graph.dimensions": ["a"],
          "graph.metrics": ["b"],
          "graph.x_axis.scale": "ordinal",
        }),
      );

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("(empty)");
    });
  });

  describe("with binned dimension (histogram)", () => {
    it("should filter out null values (metabase#16049)", () => {
      H.visitQuestionAdhoc({
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

      H.chartPathWithFillColor("#509EE3").should("have.length", 5); // there are six bars when null isn't filtered
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1,800"); // correct data has this on the y-axis
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("16,000").should("not.exist"); // If nulls are included the y-axis stretches much higher
    });
  });

  describe("with very low and high values", () => {
    it("should display correct data values", () => {
      H.visitQuestionAdhoc({
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

      H.echartsContainer()
        .get("text")
        .should("contain", "19")
        .and("contain", "20.0M");
    });
  });

  describe("with x-axis series", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc(breakoutBarChart);

      H.openVizSettingsSidebar();
      H.sidebar().findByText("Data").click();
    });

    it("should allow you to show/hide and reorder columns", () => {
      H.getDraggableElements().eq(0).as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", { vertical: 100 });

      cy.findAllByTestId("legend-item").eq(0).should("contain.text", "Gadget");
      cy.findAllByTestId("legend-item").eq(1).should("contain.text", "Gizmo");
      cy.findAllByTestId("legend-item")
        .eq(2)
        .should("contain.text", "Doohickey");
      cy.findAllByTestId("legend-item").eq(3).should("contain.text", "Widget");

      H.getDraggableElements().eq(1).icon("close").click({ force: true }); // Hide Gizmo

      cy.findByTestId("query-visualization-root")
        .findByText("Gizmo")
        .should("not.exist");
      cy.findAllByTestId("legend-item").should("have.length", 3);
      H.chartPathWithFillColor("#F2A86F").should("be.visible");
      H.chartPathWithFillColor("#F9D45C").should("be.visible");
      H.chartPathWithFillColor("#88BF4D").should("be.visible");

      H.leftSidebar().button("Add another series").click();
      H.popover().findByText("Gizmo").click();

      cy.findByTestId("query-visualization-root")
        .findByText("Gizmo")
        .should("exist");
      cy.findAllByTestId("legend-item").should("have.length", 4);
      H.chartPathWithFillColor("#F2A86F").should("be.visible");
      H.chartPathWithFillColor("#F9D45C").should("be.visible");
      H.chartPathWithFillColor("#88BF4D").should("be.visible");
      H.chartPathWithFillColor("#A989C5").should("be.visible");

      cy.findAllByTestId("legend-item").contains("Gadget").click();
      H.popover().findByText("See these Orders").click();
      cy.findByTestId("qb-filters-panel")
        .findByText("Product → Category is Gadget")
        .should("exist");
    });

    it("should gracefully handle removing filtered items, and adding new items to the end of the list", () => {
      H.getDraggableElements().first().as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", { vertical: 100 });

      H.getDraggableElements().eq(1).icon("close").click({ force: true }); // Hide Gizmo

      H.queryBuilderHeader()
        .button(/Filter/)
        .click();
      H.popover().within(() => {
        cy.findByText("Product").click();
        cy.findByText("Category").click();
      });
      H.selectFilterOperator("Is not");
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Apply filter").click();
      });
      H.getDraggableElements().should("have.length", 2);
      H.getDraggableElements().eq(0).should("have.text", "Doohickey");
      H.getDraggableElements().eq(1).should("have.text", "Widget");

      cy.findByTestId("qb-filters-panel").icon("close").click();

      H.getDraggableElements().should("have.length", 3);
      H.getDraggableElements().eq(0).should("have.text", "Gadget");
      H.getDraggableElements().eq(1).should("have.text", "Doohickey");
      H.getDraggableElements().eq(2).should("have.text", "Widget");

      H.leftSidebar().button("Add another series").click();
      H.popover().findByText("Gizmo").click();

      H.getDraggableElements().should("have.length", 4);
      H.getDraggableElements().eq(0).should("have.text", "Gadget");
      H.getDraggableElements().eq(1).should("have.text", "Gizmo");
      H.getDraggableElements().eq(2).should("have.text", "Doohickey");
      H.getDraggableElements().eq(3).should("have.text", "Widget");
    });
  });

  // Note (EmmadUsmani): see `line_chart.cy.spec.js` for more test cases of this
  describe("with split y-axis (metabase#12939)", () => {
    it("should split the y-axis when column settings differ", () => {
      H.visitQuestionAdhoc({
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

      H.echartsContainer().within(() => {
        cy.get("text").contains("Average of Total").should("be.visible");
        cy.get("text").contains("Min of Total").should("be.visible");
      });
    });

    it("should not split the y-axis when semantic_type, column settings are same and values are not far", () => {
      H.visitQuestionAdhoc({
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
      H.visitQuestionAdhoc({
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

      H.echartsContainer().within(() => {
        cy.get("text").contains("m1").should("exist");
        cy.get("text").contains("m2").should("exist");
      });
    });
  });

  describe("with stacked bars", () => {
    [false, true].forEach((devMode) => {
      it(`should drill-through correctly when stacking - development-mode: ${devMode}`, () => {
        cy.intercept("/api/session/properties", (req) => {
          req.continue((res) => {
            res.body["token-features"].development_mode = devMode;
          });
        });
        H.visitQuestionAdhoc({
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
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("See these Products").click();

        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Category is Doohickey").should("be.visible");
      });
    });
  });

  it("supports gray series colors", () => {
    const grayColor = "#F2F2F3";

    H.visitQuestionAdhoc({
      ...breakoutBarChart,
      visualization_settings: {
        "graph.dimensions": ["CATEGORY", "SOURCE"],
        "graph.metrics": ["count"],
      },
    });

    // Ensure the gray color did not get assigned to series
    H.chartPathWithFillColor(grayColor).should("not.exist");

    H.openVizSettingsSidebar();

    // Open color picker for the first series
    cy.findByLabelText("#88BF4D").click();

    // Assign gray color to the first series
    cy.findByLabelText(grayColor).click();

    H.chartPathWithFillColor(grayColor).should("be.visible");
  });

  it("supports up to 100 series (metabase#28796)", () => {
    H.visitQuestionAdhoc({
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

    H.openVizSettingsSidebar();
    H.leftSidebar().button("90 more series").click();
    cy.get("[data-testid^=draggable-item]").should("have.length", 100);

    cy.findByTestId("qb-filters-panel")
      .findByText("ID is less than 101")
      .click();
    H.popover().within(() => {
      cy.findByDisplayValue("101").type("{backspace}2");
      cy.button("Update filter").click();
    });

    H.queryBuilderMain().findByText(
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

    H.createDashboardWithQuestions({
      dashboardName: "Split Test Dashboard",
      questions: [multiMetric],
    }).then(({ dashboard }) => {
      H.createQuestion(sumTotalByMonth, { wrapId: true }).then(() => {
        cy.get("@questionId").then((questionId) => {
          H.cypressWaitAll([
            H.createQuestionAndAddToDashboard(avgTotalByMonth, dashboard.id, {
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
            H.createQuestionAndAddToDashboard(breakoutQuestion, dashboard.id, {
              col: 0,
              row: 9,
              size_x: 20,
            }),
          ]).then(() => {
            H.visitDashboard(dashboard.id);
          });
        });
      });
    });

    //This card is testing #33725 now, as the changes made for #34618 would cause "Should not Split" to no longer split and error
    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Should split")
      .within(() => {
        // Verify this axis tick exists twice which verifies there are two y-axes
        H.echartsContainer().findAllByText("3.0k").should("have.length", 2);
      });

    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Multi Series")
      .within(() => {
        H.echartsContainer().findByText("Average Total by Month");
        H.echartsContainer().findByText("Sum Total by Month");
      });

    cy.log("Should not produce a split axis graph (#34618)");
    cy.findAllByTestId("dashcard")
      .contains("[data-testid=dashcard]", "Should not Split")
      .within(() => {
        H.getValueLabels()
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

    H.createQuestion(multiMetric, { visitQuestion: true });

    const [firstMetric, secondMetric] = H.chartPathsWithFillColors([
      "#88BF4D",
      "#98D9D9",
    ]);
    firstMetric.then(($metricOne) => {
      const { height: heightMetricOne } = $metricOne[0].getBoundingClientRect();
      secondMetric.then(($metricTwo) => {
        const { height: heightMetricTwo } =
          $metricTwo[0].getBoundingClientRect();

        // since the first metric is scaled to be half of the second metric
        // the first bar should be half the size of the first bar
        // within a given tolerance
        expect(heightMetricOne - heightMetricTwo / 2).to.be.lessThan(0.1);
      });
    });

    H.chartPathWithFillColor("#88BF4D").first().realHover();
    H.assertEChartsTooltip({
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

    H.createNativeQuestion(
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

    H.chartPathWithFillColor("#A989C5").eq(0).realHover();
    H.assertEChartsTooltip({
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
    H.echartsTriggerBlur();

    H.chartPathWithFillColor("#A989C5").eq(1).realHover();
    H.assertEChartsTooltip({
      rows: [
        {
          color: "#F9D45C",
          name: "yellow",
          value: "8",
          secondaryValue: "100 %",
        },
        { name: "Total positive", value: "8" },
        {
          color: "#A989C5",
          name: "blue",
          value: "-16",
          secondaryValue: "-100 %",
        },
        { name: "Total negative", value: "-16" },
        { name: "Total", value: "-8" },
      ],
    });
    H.echartsTriggerBlur();

    H.chartPathWithFillColor("#A989C5").eq(2).realHover();
    H.assertEChartsTooltip({
      rows: [
        {
          color: "#F9D45C",
          name: "yellow",
          value: "5",
          secondaryValue: "100 %",
        },
        { name: "Total positive", value: "5" },
        {
          color: "#A989C5",
          name: "blue",
          value: "-7",
          secondaryValue: "-100 %",
        },
        { name: "Total negative", value: "-7" },
        { name: "Total", value: "-2" },
      ],
    });
    H.echartsTriggerBlur();

    H.chartPathWithFillColor("#A989C5").eq(3).realHover();
    H.assertEChartsTooltip({
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "2",
          secondaryValue: "100 %",
        },
        { name: "Total positive", value: "2" },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "-2",
          secondaryValue: "-100 %",
        },
        { name: "Total negative", value: "-2" },
        { name: "Total", value: "0" },
      ],
    });
    H.echartsTriggerBlur();

    H.chartPathWithFillColor("#A989C5").eq(4).realHover();
    H.assertEChartsTooltip({
      rows: [
        {
          color: "#A989C5",
          name: "blue",
          value: "3",
          secondaryValue: "100 %",
        },
        { name: "Total positive", value: "3" },
        {
          color: "#F9D45C",
          name: "yellow",
          value: "-2",
          secondaryValue: "-100 %",
        },
        { name: "Total negative", value: "-2" },
        { name: "Total", value: "1" },
      ],
    });
    H.echartsTriggerBlur();
  });

  it("should correctly show tool-tips when stacked bar charts contain multiple positive and multiple negative segments (#47596)", () => {
    cy.signInAsAdmin();

    H.createNativeQuestion(
      {
        name: "47596",
        native: {
          query: `${[
            "select date '2024-05-21' AS created_at, 'cat1' AS category, 2 as v",
            "select date '2024-05-21', 'cat2', -1",
            "select date '2024-05-21', 'cat3', 1",
            "select date '2024-05-21', 'cat4', -1",
          ].join(" union all ")} order by created_at`,
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

    H.chartPathWithFillColor("#F9D45C").eq(0).realHover();
    H.assertEChartsTooltip({
      rows: [
        {
          color: "#EF8C8C",
          name: "cat1",
          value: "2",
          secondaryValue: "66.67 %",
        },
        {
          color: "#F2A86F",
          name: "cat3",
          value: "1",
          secondaryValue: "33.33 %",
        },
        { name: "Total positive", value: "3" },
        {
          color: "#98D9D9",
          name: "cat4",
          value: "-1",
          secondaryValue: "-50.00 %",
        },
        {
          color: "#F9D45C",
          name: "cat2",
          value: "-1",
          secondaryValue: "-50.00 %",
        },
        { name: "Total negative", value: "-2" },
        { name: "Total", value: "1" },
      ],
    });
    H.echartsTriggerBlur();
  });

  it(
    "should allow grouping series into a single 'Other' series",
    { tags: "@skip" },
    () => {
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
          H.leftSidebar().findByTestId("settings-STATE").click();
        } else {
          H.leftSidebar().findByLabelText("Other series settings").click();
        }
        H.popover()
          .findByTestId("graph-max-categories-input")
          .type(`{selectAll}${value}`)
          .blur();
        cy.wait(500); // wait for viz to re-render
      }

      function setOtherCategoryAggregationFn(fnName) {
        H.leftSidebar().findByLabelText("Other series settings").click();
        H.popover()
          .findByTestId("graph-other-category-aggregation-fn-picker")
          .click();
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.popover().last().findByText(fnName).click();
      }

      H.visitQuestionAdhoc({
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
      H.openVizSettingsSidebar();
      H.leftSidebar().findByTestId("settings-STATE").click();
      H.popover().findByLabelText("Enforce maximum number of series").click();

      // Test 'Other' series renders
      H.otherSeriesChartPaths().should("have.length", 6);

      // Test drill-through is disabled for 'Other' series
      H.otherSeriesChartPaths().first().click();
      cy.findByTestId("click-actions-view").should("not.exist");

      // Test drill-through is enabled for regular series
      H.chartPathWithFillColor(AK_SERIES_COLOR).first().click();
      cy.findByTestId("click-actions-view").should("exist");

      // Test legend and series visibility toggling
      H.queryBuilderMain()
        .findAllByTestId("legend-item")
        .should("have.length", 9)
        .last()
        .as("other-series-legend-item");
      cy.get("@other-series-legend-item")
        .findByLabelText("Hide series")
        .click();
      H.otherSeriesChartPaths().should("have.length", 0);
      cy.get("@other-series-legend-item")
        .findByLabelText("Show series")
        .click();
      H.otherSeriesChartPaths().should("have.length", 6);

      // Test tooltips
      H.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
      H.assertEChartsTooltip({ rows: [{ name: "Other", value: "9" }] });
      H.otherSeriesChartPaths().first().realHover();
      H.assertEChartsTooltip({
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
      H.queryBuilderMain().click(); // close popover
      H.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
      H.echartsTooltip().find("tr").should("have.length", 5);
      H.queryBuilderMain()
        .findAllByTestId("legend-item")
        .should("have.length", 5);

      // Test can move series in/out of "Other" series
      H.getDraggableElements().eq(3).as("AZ");
      H.moveDnDKitElementByAlias("@AZ", { vertical: 150 }); // Move AZ into "Other"
      H.getDraggableElements().eq(6).as("CT");
      H.moveDnDKitElementByAlias("@CT", { vertical: -150 }); // Move CT out of "Other"

      H.queryBuilderMain()
        .findAllByTestId("legend-item")
        .should("have.length", 5);
      H.queryBuilderMain()
        .findAllByTestId("legend-item")
        .contains("AZ")
        .should("not.exist");
      H.queryBuilderMain()
        .findAllByTestId("legend-item")
        .contains("CT")
        .should("exist");

      // Test "graph.max_categories" removes "Other" altogether
      setMaxCategories(0);
      H.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
      H.echartsTooltip().find("tr").should("have.length", 14);
      H.queryBuilderMain()
        .findAllByTestId("legend-item")
        .should("have.length", 14);
      H.otherSeriesChartPaths().should("not.exist");
      setMaxCategories(8, { viaBreakoutSettings: true });

      // Test "graph.other_category_aggregation_fn" for native queries
      H.openNotebook();
      H.queryBuilderHeader().findByLabelText("View SQL").click();
      cy.findByTestId("native-query-preview-sidebar")
        .button("Convert this question to SQL")
        .click();
      cy.wait("@dataset");
      H.queryBuilderMain().findByTestId("visibility-toggler").click();

      H.openVizSettingsSidebar();
      setOtherCategoryAggregationFn("Average");

      H.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
      H.assertEChartsTooltip({ rows: [{ name: "Other", value: "1.5" }] });

      H.otherSeriesChartPaths().first().realHover();
      H.assertEChartsTooltip({
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

      H.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
      H.assertEChartsTooltip({ rows: [{ name: "Other", value: "1" }] });

      H.otherSeriesChartPaths().first().realHover();
      H.assertEChartsTooltip({ rows: [{ name: "Min", value: "1" }] });

      setOtherCategoryAggregationFn("Max");

      H.chartPathWithFillColor(AK_SERIES_COLOR).first().realHover();
      H.assertEChartsTooltip({ rows: [{ name: "Other", value: "3" }] });

      H.otherSeriesChartPaths().first().realHover();
      H.assertEChartsTooltip({ rows: [{ name: "Max", value: "3" }] });
    },
  );

  it("should format goal tooltip value as a percent when the Stacking option is 'Stack - 100%'", () => {
    H.visitQuestionAdhoc({
      ...breakoutBarChart,
      visualization_settings: {
        "graph.goal_value": 87.5,
        "graph.show_goal": true,
        "stackable.stack_type": "normalized",
      },
    });

    H.echartsContainer().findByText("Goal").trigger("mousemove");

    H.popover().within(() => {
      cy.findByText("Goal:").should("exist");
      cy.findByText("87.5%").should("exist");
    });
  });

  it("should display all axis labels for 12 months of data (metabase#60475)", () => {
    cy.viewport(1600, 800);

    // Create a bar chart showing count of orders by month for the last 12 months
    H.visitQuestionAdhoc({
      display: "bar",
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "month" },
            ],
          ],
          filter: [
            "time-interval",
            ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
            -12,
            "month",
          ],
        },
        database: SAMPLE_DB_ID,
      },
    });

    // Wait for the chart to render
    cy.wait("@dataset");
    H.echartsContainer().should("be.visible");

    // Get all x-axis labels
    H.echartsContainer().within(() => {
      // ECharts renders axis labels as text elements in SVG
      // We should see labels for all 12 months
      cy.get('svg text[text-anchor="middle"]')
        .should("have.length.at.least", 12)
        .should("be.visible");
    });
  });

  it("should rotate axis labels when they do not fit horizontally instead of hiding them (metabase#68048)", () => {
    // Use a smaller viewport to ensure labels need to rotate
    cy.viewport(940, 800);

    const query = `
      SELECT * FROM (
        VALUES
        ('Alnyba', 390000),
        ('Bvsieginlri', 500000),
        ('Cflonta', 700000),
        ('Dgamruh', 50000),
        ('Eitstrugb', 130000),
        ('Farnotcs', 107000),
        ('Gkro', 750000)
      ) AS Data(LABEL, amount)
    `;

    H.visitQuestionAdhoc({
      display: "bar",
      dataset_query: {
        type: "native",
        native: { query, "template-tags": {} },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        "graph.dimensions": ["LABEL"],
        "graph.metrics": ["amount"],
      },
    });

    // Open the data reference sidebar to squish the data further
    cy.findByLabelText("Learn about your data").click();

    cy.wait("@dataset");
    H.echartsContainer().should("be.visible");

    // Verify all 7 labels are visible and rotated (not hidden)
    const expectedLabels = [
      "Alnyba",
      "Bvsieginlri",
      "Cflonta",
      "Dgamruh",
      "Eitstrugb",
      "Farnotcs",
      "Gkro",
    ];

    H.echartsContainer().within(() => {
      // When labels don't fit horizontally, ECharts rotates them
      // Rotated labels have a transform attribute containing rotation
      expectedLabels.forEach((label) => {
        cy.contains("text", label).should("be.visible");
      });

      // Verify labels are rotated by checking for transform attribute with rotation
      // ECharts applies rotation via transform attribute when labels don't fit
      cy.get("text")
        .filter((_, el) =>
          expectedLabels.some((label) => el.textContent?.includes(label)),
        )
        .should("have.length", 7)
        .first()
        .should("have.attr", "transform")
        .and("match", /matrix/);
    });
  });
});
