const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { DashboardId } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const CATEGORY_COLOR = {
  DOOHICKEY: "#88BF4D",
  GADGET: "#F9D45C",
  GIZMO: "#A989C5",
  WIDGET: "#F2A86F",
};

describe("scenarios > visualizations > line/bar chart > tooltips", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be enterable and scrollable to view all rows in long tooltips (metabase#53586) (metabase#48347)", () => {
    H.visitQuestionAdhoc({
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
    });

    showTooltipForBarInSeries("#A989C5", 3);
    H.echartsTooltip()
      .findByText("155 – 160") // bottom row
      .scrollIntoView()
      .should("be.visible");
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

  it("should show percent change, and updated column titles after editing them via Visualization Options, in tooltips of a dashcard with an added series", () => {
    const SUM_OF_TOTAL: StructuredQuestionDetails = {
      name: "Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    };
    const AVG_OF_TOTAL: StructuredQuestionDetails = {
      name: "Q2",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    };

    H.createQuestion(SUM_OF_TOTAL).then(({ body: card }) => {
      H.createQuestion(AVG_OF_TOTAL).then(({ body: addedCard }) => {
        H.createDashboard().then(({ body: { id: dashboardId } }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id: dashboardId,
            card_id: card.id,
            card: { size_x: 24, size_y: 12, series: [addedCard] },
          });
          cy.wrap(dashboardId).as("dashboardId");
          H.visitDashboard(dashboardId);
        });
      });
    });

    showTooltipForCircleInSeries("#88BF4D");
    H.assertEChartsTooltip({
      header: "2025",
      rows: [{ color: "#88BF4D", name: "Q1", value: "42,156.87" }],
    });

    showTooltipForCircleInSeries("#A989C5");
    H.assertEChartsTooltip({
      header: "2025",
      rows: [{ color: "#A989C5", name: "Q2", value: "56.66" }],
    });

    showTooltipForCircleInSeries("#88BF4D", 1);
    H.assertEChartsTooltip({
      header: "2026",
      rows: [
        {
          color: "#88BF4D",
          name: "Q1",
          value: "205,256.02",
          secondaryValue: "+386.89%",
        },
      ],
    });

    showTooltipForCircleInSeries("#A989C5", 1);
    H.assertEChartsTooltip({
      header: "2026",
      rows: [
        {
          color: "#A989C5",
          name: "Q2",
          value: "56.86",
          secondaryValue: "+0.34%",
        },
      ],
    });

    H.editDashboard();
    H.showDashcardVisualizerModal(0, {
      isVisualizerCard: false,
    });
    H.modal().within(() => {
      cy.button("Settings").click();
      updateColumnTitle("Q1", "Custom Q1");
      updateColumnTitle("Q2", "Custom Q2");
    });
    // Use the helper (instead of an inline Save click) so we wait for the
    // modal to close and the dashcard change to commit. Otherwise
    // `saveDashboard()` can run before the dashboard is marked dirty and no
    // PUT /api/dashboard/* request is ever made.
    H.saveDashcardVisualizerModalSettings();
    H.saveDashboard();

    // the titles come back from the backend
    cy.get<DashboardId>("@dashboardId").then((dashboardId) => {
      H.visitDashboard(dashboardId);
    });

    showTooltipForCircleInSeries("#88BF4D");
    H.assertEChartsTooltip({
      header: "2025",
      rows: [{ color: "#88BF4D", name: "Custom Q1", value: "42,156.87" }],
    });

    showTooltipForCircleInSeries("#A989C5");
    H.assertEChartsTooltip({
      header: "2025",
      rows: [{ color: "#A989C5", name: "Custom Q2", value: "56.66" }],
    });
  });
});

describe("scenarios > visualizations > legend", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should toggle series visibility on a public dashboard, and keep full Y-axis formatting and custom ticks", () => {
    H.createDashboardWithQuestions({
      questions: [
        {
          name: "single aggregation series",
          display: "bar",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "temporal-unit": "year", "base-type": "type/DateTime" },
              ],
              [
                "field",
                PRODUCTS.CATEGORY,
                { "source-field": ORDERS.PRODUCT_ID, "base-type": "type/Text" },
              ],
            ],
          },
          visualization_settings: {
            "graph.label_value_formatting": "full",
            "graph.y_axis.split_number": 5,
          },
        },
      ],
      cards: [{ col: 0, row: 0, size_x: 24, size_y: 6 }],
    }).then(({ dashboard }) => {
      H.visitPublicDashboard(dashboard.id);
    });

    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);
    H.echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis label
      cy.findByText("Created At: Year").should("exist"); // x-axis label
      cy.findByText("1,800").should("be.visible");
      cy.findByText("1,500").should("be.visible");
      cy.findByText("1,200").should("be.visible");
      cy.findByText("1.8k").should("not.exist");
    });

    hideSeries(1); // Gadget

    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);
    H.echartsContainer().within(() => {
      cy.findByText("1,800").should("be.visible");
      cy.findByText("1,500").should("be.visible");
      cy.findByText("1,200").should("be.visible");
      cy.findByText("900").should("be.visible");
    });
  });
});

function showTooltipForCircleInSeries(seriesColor: string, index = 0) {
  H.echartsTriggerBlur();
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.cartesianChartCircleWithColor(seriesColor).eq(index).trigger("mousemove");
}

function showTooltipForBarInSeries(seriesColor: string, index = 0) {
  H.echartsTriggerBlur();
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.chartPathWithFillColor(seriesColor).eq(index).realHover();
}

function updateColumnTitle(originalText: string, updatedText: string) {
  cy.findByTestId("chartsettings-list-container")
    .findByDisplayValue(originalText)
    .clear()
    .type(updatedText)
    .blur();
}

function hideSeries(legendItemIndex: number) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByTestId("legend-item")
    .eq(legendItemIndex)
    .findByLabelText("Hide series")
    .click({ scrollBehavior: "nearest" });
}
