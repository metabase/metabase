import { restore, visitQuestionAdhoc, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const Y_AXIS_RIGHT_SELECTOR = ".axis.yr";

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
  },
  database: 1,
};

describe("scenarios > visualizations > line chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
  });

  it("should be able to change y axis position (metabase#13487)", () => {
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    cy.wait("@dataset");
    cy.findByText("Settings").click();
    cy.findByText("Right").click();
    cy.get(Y_AXIS_RIGHT_SELECTOR);
  });

  it.skip("should be able to format data point values style independently on multi-series chart (metabase#13095)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.TOTAL, null]],
            [
              "aggregation-options",
              ["/", ["avg", ["field", ORDERS.QUANTITY, null]], 10],
              { "display-name": "AvgPct" },
            ],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: 1,
      },
      display: "line",
      visualization_settings: {
        "graph.show_values": true,
        column_settings: {
          '["name","expression"]': { number_style: "percent" },
        },
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["sum", "expression"],
      },
    });

    cy.get(".value-labels").contains("30%");
  });

  it("should correctly display tooltip values when X-axis is numeric and style is 'Ordinal' (metabase#15998)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["avg", ["field", ORDERS.QUANTITY, null]],
          ],
          breakout: [
            ["field", PRODUCTS.RATING, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count", "sum", "avg"],
      },
    });
    cy.get(".Visualization .enable-dots")
      .last()
      .find(".dot")
      .eq(3)
      .trigger("mousemove", { force: true });
    popover().within(() => {
      testPairedTooltipValues("Product → Rating", "2.7");
      testPairedTooltipValues("Count", "191");
      testPairedTooltipValues("Sum of Total", "14,747.05");
      testPairedTooltipValues("Average of Quantity", "4");
    });
  });

  it("should be possible to update/change label for an empty row value (metabase#12128)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT '2020-03-01'::date as date, 'cat1' as category, 23 as value\nUNION ALL\nSELECT '2020-03-01'::date, '', 44\nUNION ALL\nSELECT  '2020-03-01'::date, 'cat3', 58\n\nUNION ALL\n\nSELECT '2020-03-02'::date as date, 'cat1' as category, 20 as value\nUNION ALL\nSELECT '2020-03-02'::date, '', 50\nUNION ALL\nSELECT  '2020-03-02'::date, 'cat3', 58",
          "template-tags": {},
        },
        database: 1,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["DATE", "CATEGORY"],
        "graph.metrics": ["VALUE"],
      },
    });

    cy.findByText("Settings").click();

    cy.findByTestId("sidebar-left").within(() => {
      // Make sure we can update input with some existing value
      cy.findByDisplayValue("cat1")
        .type(" new")
        .blur();
      cy.findByDisplayValue("cat1 new");

      // Now do the same for the input with no value
      cy.findByDisplayValue("")
        .type("cat2")
        .blur();
      cy.findByDisplayValue("cat2");

      cy.button("Done").click();
    });

    cy.get(".LegendItem")
      .should("contain", "cat1 new")
      .and("contain", "cat2")
      .and("contain", "cat3");
  });

  it("should interpolate null value by not rendering a data point (metabase#4122)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `
            select 'a' x, 1 y
            union all
            select 'b' x, null y
            union all
            select 'c' x, 2 y
          `,
          "template-tags": {},
        },
        database: 1,
      },
      display: "line",
    });

    cy.get(`.sub._0`)
      .find("circle")
      .should("have.length", 2);
  });

  describe.skip("tooltip of combined dashboard cards (multi-series) should show the correct column title (metabase#16249", () => {
    const RENAMED_FIRST_SERIES = "Foo";
    const RENAMED_SECOND_SERIES = "Bar";

    it("custom expression names (metabase#16249-1)", () => {
      createOrdersQuestionWithAggregation({
        name: "16249_Q1",
        aggregation: [
          [
            "aggregation-options",
            ["sum", ["field", ORDERS.TOTAL, null]],
            { "display-name": "CE" },
          ],
        ],
      }).then(({ body: { id: question1Id } }) => {
        createOrdersQuestionWithAggregation({
          name: "16249_Q2",
          aggregation: [
            [
              "aggregation-options",
              ["avg", ["field", ORDERS.SUBTOTAL, null]],
              { "display-name": "CE" },
            ],
          ],
        }).then(({ body: { id: question2Id } }) => {
          cy.createDashboard("16249D").then(({ body: { id: dashboardId } }) => {
            addBothSeriesToDashboard({
              dashboardId,
              firstCardId: question1Id,
              secondCardId: question2Id,
            });
            cy.visit(`/dashboard/${dashboardId}`);

            // Rename both series
            renameSeries([
              ["16249_Q1", RENAMED_FIRST_SERIES],
              ["16249_Q2", RENAMED_SECOND_SERIES],
            ]);

            assertOnLegendItemsValues();
            assertOnYAxisValues();

            showTooltipForFirstCircleInSeries(0);
            popover().within(() => {
              testPairedTooltipValues("Created At", "2016");
              testPairedTooltipValues(RENAMED_FIRST_SERIES, "42,156.87");
            });

            showTooltipForFirstCircleInSeries(1);
            popover().within(() => {
              testPairedTooltipValues("Created At", "2016");
              testPairedTooltipValues(RENAMED_SECOND_SERIES, "54.44");
            });
          });
        });
      });
    });

    it("regular column names (metabase#16249-2)", () => {
      createOrdersQuestionWithAggregation({
        name: "16249_Q3",
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      }).then(({ body: { id: question1Id } }) => {
        cy.createQuestion({
          name: "16249_Q4",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["sum", ["field", PRODUCTS.PRICE, null]]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "line",
        }).then(({ body: { id: question2Id } }) => {
          cy.createDashboard("16249D").then(({ body: { id: dashboardId } }) => {
            addBothSeriesToDashboard({
              dashboardId,
              firstCardId: question1Id,
              secondCardId: question2Id,
            });

            cy.visit(`/dashboard/${dashboardId}`);

            renameSeries([
              ["16249_Q3", RENAMED_FIRST_SERIES],
              ["16249_Q4", RENAMED_SECOND_SERIES],
            ]);

            assertOnLegendItemsValues();
            assertOnYAxisValues();

            showTooltipForFirstCircleInSeries(0);
            popover().within(() => {
              testPairedTooltipValues("Created At", "2016");
              testPairedTooltipValues(RENAMED_FIRST_SERIES, "42,156.87");
            });

            showTooltipForFirstCircleInSeries(1);
            popover().within(() => {
              testPairedTooltipValues("Created At", "2016");
              testPairedTooltipValues(RENAMED_SECOND_SERIES, "2,829.03");
            });
          });
        });
      });
    });

    /**
     * Helper functions related to repros around 16249 only!
     * Note:
     *  - This might be too abstract and highly specific.
     *  - That's true in general sense, but that's the reason we're not using them anywhere else than here.
     *  - Without these abstractions, both tests would be MUCH longer and harder to review.
     */

    function addBothSeriesToDashboard({
      dashboardId,
      firstCardId,
      secondCardId,
    } = {}) {
      // Add the first question to the dashboard
      cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
        cardId: firstCardId,
      }).then(({ body: { id: dashCardId } }) => {
        // Combine the second question with the first one as the second series
        cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
          cards: [
            {
              id: dashCardId,
              card_id: firstCardId,
              row: 0,
              col: 0,
              sizeX: 18,
              sizeY: 12,
              series: [
                {
                  id: secondCardId,
                },
              ],
              parameter_mappings: [],
            },
          ],
        });
      });
    }

    function createOrdersQuestionWithAggregation({ name, aggregation } = {}) {
      return cy.createQuestion({
        name,
        query: {
          "source-table": ORDERS_ID,
          aggregation,
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        display: "line",
      });
    }

    function renameSeries(series) {
      cy.icon("pencil").click();
      cy.get(".Card").realHover();
      cy.icon("palette").click();
      series.forEach(serie => {
        const [old_name, new_name] = serie;

        cy.findByDisplayValue(old_name)
          .clear()
          .type(new_name);
      });

      cy.get(".Modal")
        .as("modal")
        .within(() => {
          cy.button("Done").click();
        });
      cy.button("Save").click();
      cy.findByText("You're editing this dashboard.").should("not.exist");
    }

    function assertOnLegendItemsValues() {
      cy.get(".LegendItem")
        .should("contain", RENAMED_FIRST_SERIES)
        .and("contain", RENAMED_SECOND_SERIES);
    }

    function assertOnYAxisValues() {
      cy.get(".y-axis-label")
        .should("contain", RENAMED_FIRST_SERIES)
        .and("contain", RENAMED_SECOND_SERIES);
    }
  });

  describe("problems with the labels when showing only one row in the results (metabase#12782, metabase#4995)", () => {
    beforeEach(() => {
      visitQuestionAdhoc({
        dataset_query: {
          database: 1,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
              ["field", PRODUCTS.CATEGORY, null],
            ],
            filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
          },
          type: "query",
        },
        display: "line",
      });
      cy.findByText("Category is Doohickey");
    });

    it.skip("should not drop the chart legend (metabase#4995)", () => {
      cy.get(".LegendItem").should("contain", "Doohickey");
    });

    it("should display correct axis labels (metabase#12782)", () => {
      cy.get(".x-axis-label")
        .invoke("text")
        .should("eq", "Created At");
      cy.get(".y-axis-label")
        .invoke("text")
        .should("eq", "Average of Price");
    });
  });
});

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1)
    .closest("td")
    .siblings("td")
    .findByText(val2);
}

function showTooltipForFirstCircleInSeries(series_index) {
  cy.get(`.sub._${series_index}`)
    .as("firstSeries")
    .find("circle")
    .first()
    .realHover();
}
