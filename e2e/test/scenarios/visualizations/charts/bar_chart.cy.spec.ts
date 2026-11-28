const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > bar chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("with binned dimension (histogram)", () => {
    it("should display bar chart for binned column distribution after applying filter (metabase#10493)", () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
          },
          database: SAMPLE_DB_ID,
        },
      });

      cy.log("Click on Quantity column header and select Distribution");
      H.tableHeaderClick("Quantity");
      H.popover().findByText("Distribution").click();
      cy.wait("@dataset");

      cy.log("Verify bar chart is displayed with binned quantity as dimension");
      cy.findByTestId("visualization-root").should(
        "have.attr",
        "data-viz-ui-name",
        "Bar",
      );
      H.chartPathWithFillColor("#509EE3").should("have.length", 9);

      cy.log("Apply filter: count >= 20");
      cy.findByTestId("qb-header-action-panel").findByText("Filter").click();
      H.popover().within(() => {
        cy.findByText("Summaries").click();
        cy.findByText("Count").click();
      });
      H.selectFilterOperator("Greater than or equal to");
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("20");
        cy.button("Apply filter").click();
      });

      cy.wait("@dataset");

      cy.log(
        "Verify bar chart is still displayed (binned column should still be treated as dimension)",
      );
      H.assertQueryBuilderRowCount(5);
      cy.findByTestId("visualization-placeholder").should("not.exist");
      cy.findByTestId("visualization-root").should(
        "have.attr",
        "data-viz-ui-name",
        "Bar",
      );
      H.chartPathWithFillColor("#509EE3").should("have.length", 5);
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
                ["field", PRODUCTS.CATEGORY, null],
                ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
              ],
            },
          },
          display: "bar",
          visualization_settings: { "stackable.stack_type": "stacked" },
        });

        cy.findAllByTestId("legend-item")
          .findByText("Doohickey")
          .should("be.visible");
        cy.findByTestId("development-watermark").should(
          devMode ? "exist" : "not.exist",
        );

        cy.findAllByTestId("legend-item").findByText("Doohickey").click();
        H.popover().findByText("See these Products").click();

        cy.findByTestId("qb-filters-panel")
          .findByText("Category is Doohickey")
          .should("be.visible");
      });
    });

    it("should not crash when renaming an aggregation changes sibling column deduplication (metabase#68819)", () => {
      // Create a question with two Sum of Total aggregations
      // These will be deduplicated as "sum" and "sum_2"
      const questionDetails = {
        display: "bar" as const,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        visualization_settings: {
          "stackable.stack_type": "stacked" as const,
          "graph.dimensions": ["CREATED_AT", "CATEGORY"],
          "graph.metrics": ["sum", "sum_2"],
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });

      H.echartsContainer().should("be.visible");

      H.openNotebook();

      H.getNotebookStep("summarize")
        .findByTestId("aggregate-step")
        .findAllByTestId("notebook-cell-item")
        .first()
        .click();

      cy.findByLabelText("Back").click();

      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.nameInput().clear().type("Sum");
      H.popover().button("Update").click();

      H.saveSavedQuestion();

      cy.button("Visualize").click();

      // The bug would cause: TypeError: cannot read properties of undefined (reading 'name')
      H.echartsContainer().should("be.visible");
      cy.findByTestId("query-builder-main")
        .findByText(/error/i)
        .should("not.exist");

      cy.reload();
      H.echartsContainer().should("be.visible");
    });
  });
});

describe("scenarios > visualizations > rows", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  // Until we enable multi-browser support, this repro will be skipped by Cypress in CI
  // Issue was specific to Firefox only - it is still possible to test it locally
  ["0", "null"].forEach((testValue) => {
    it(
      `should not collapse rows when last value is ${testValue} (metabase#14285)`,
      { browser: "firefox" },
      () => {
        H.createNativeQuestion(
          {
            name: "14285",
            native: {
              query: `
              with temp as (
                select 'a' col1, 25 col2 union all
                select 'b', 10 union all
                select 'c', 15 union all
                select 'd', ${testValue} union all
                select 'e', 30 union all
                select 'f', 35
              ) select * from temp
              order by 2 desc
            `,
              "template-tags": {},
            },
            display: "row",
          },
          { visitQuestion: true },
        );

        cy.findByTestId("query-visualization-root").within(() => {
          ["a", "b", "c", "d", "e", "f"].forEach((letter) => {
            cy.findByText(letter);
          });
        });
      },
    );
  });

  it("should display a row chart", () => {
    H.createNativeQuestion(
      {
        name: "14285",
        native: {
          query: `
            with temp as (
              select 'a' col1, 51 column_two union all
              select 'b', 41 union all
              select 'c', 31 union all
              select 'd', 21 union all
              select 'e', 11 union all
              select 'f', 4
            ) select * from temp
            order by 2 desc
          `,
          "template-tags": {},
        },
        display: "row",
        visualization_settings: {
          "graph.show_values": true, // so we can assert on them
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("query-visualization-root").within(() => {
      ["a", "b", "c", "d", "e", "f"].forEach((letter) => {
        cy.findByText(letter);
      });
      [51, 41, 31, 21, 11, 4].forEach((value) => {
        cy.findByText(String(value));
      });
      cy.findByText("COLUMN_TWO");
    });

    // Verify hovering bars does not change their size (metabase#43631)
    H.chartPathWithFillColor("#F2A86F")
      .first()
      .then(($bar) => {
        const prevWidth = $bar[0].getBoundingClientRect().width;
        expect(prevWidth).to.be.greaterThan(0);
        cy.wrap($bar).realHover();
        H.assertEChartsTooltip({
          header: "a",
          rows: [{ name: "COLUMN_TWO", value: "51" }],
        });
        // Re-querying after the hover finds a different bar, so measure the same node.
        cy.wrap($bar).should(([hoveredBar]) => {
          expect(hoveredBar.getBoundingClientRect().width).to.equal(prevWidth);
        });
      });
  });
});

describe("scenarios > visualizations > combo", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should apply per-series display type on a question and dashcard (metabase#69882)", () => {
    const DOOHICKEY_BAR_COLOR = "#227FD2";
    const GADGET_LINE_COLOR = "#689636";

    H.createQuestion(
      {
        name: "69882",
        display: "combo",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
        visualization_settings: {
          series_settings: {
            Doohickey: {
              color: DOOHICKEY_BAR_COLOR,
              title: "_Doohickey",
              display: "bar",
            },
            Gadget: {
              color: GADGET_LINE_COLOR,
              title: "_Gadget",
              display: "line",
            },
          },
          "graph.x_axis.scale": "timeseries",
          "graph.dimensions": ["CREATED_AT", "CATEGORY"],
          "graph.metrics": ["count"],
        },
      },
      { visitQuestion: true, wrapId: true },
    );

    H.echartsContainer().should("be.visible");
    H.chartPathWithFillColor(DOOHICKEY_BAR_COLOR).should("exist");
    H.cartesianChartCircleWithColor(GADGET_LINE_COLOR);

    H.createDashboard({ name: "Test Dashboard" }, { wrapId: true });
    cy.get<number>("@questionId").then((cardId) => {
      cy.get<number>("@dashboardId").then((dashboardId) => {
        H.addQuestionToDashboard({ dashboardId, cardId });
        H.visitDashboard(dashboardId);
      });
    });

    cy.findByTestId("dashcard").within(() => {
      H.echartsContainer().should("be.visible");
      H.chartPathWithFillColor(DOOHICKEY_BAR_COLOR).should("exist");
      H.cartesianChartCircleWithColor(GADGET_LINE_COLOR);
    });
  });
});
