import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

const ORDERS_CREATED_AT_FIELD_REF = [
  "field",
  ORDERS.CREATED_AT,
  { "temporal-unit": "year", "base-type": "type/DateTime" },
];

const JOINED_PRODUCT_CATEGORY_FIELD_REF = [
  "field",
  PRODUCTS.CATEGORY,
  { "source-field": ORDERS.PRODUCT_ID, "base-type": "type/Text" },
];

const JOINED_PEOPLE_STATE_FIELD_REF = [
  "field",
  PEOPLE.STATE,
  { "source-field": ORDERS.USER_ID, "base-type": "type/Text" },
];

const CATEGORY_COLOR = {
  DOOHICKEY: "#88BF4D",
  GADGET: "#F9D45C",
  GIZMO: "#A989C5",
  WIDGET: "#F2A86F",
};

const SINGLE_AGGREGATION_QUESTION = {
  name: "single aggregation series",
  display: "bar",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [ORDERS_CREATED_AT_FIELD_REF, JOINED_PRODUCT_CATEGORY_FIELD_REF],
  },
};

const MANY_LEGEND_ITEMS_QUESTION = {
  name: "vertical legend with popover",
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [ORDERS_CREATED_AT_FIELD_REF, JOINED_PEOPLE_STATE_FIELD_REF],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT", "STATE"],
    "graph.metrics": ["count"],
  },
};

const PIE_CHART_QUESTION = {
  name: "pie chart",
  display: "pie",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [JOINED_PEOPLE_STATE_FIELD_REF],
  },
  visualization_settings: {
    "pie.slice_threshold": 4,
  },
};

const SPLIT_AXIS_QUESTION = {
  name: "two aggregations + split axis + trendline",
  display: "combo",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ["sum", ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }]],
    ],
    breakout: [ORDERS_CREATED_AT_FIELD_REF],
  },
  visualization_settings: {
    "graph.show_trendline": true,
  },
};

const SCATTER_VIZ_QUESTION = {
  name: "scatter",
  display: "scatter",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      [
        "distinct",
        ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    ],
    breakout: [ORDERS_CREATED_AT_FIELD_REF, JOINED_PRODUCT_CATEGORY_FIELD_REF],
  },
  visualization_settings: {
    "graph.dimensions": ["count", "CATEGORY"],
    "graph.metrics": ["count_2"],
  },
};

describe("scenarios > visualizations > legend", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should toggle series visibility on a dashboard", () => {
    cy.createDashboardWithQuestions({
      questions: [
        SINGLE_AGGREGATION_QUESTION,
        MANY_LEGEND_ITEMS_QUESTION,
        SPLIT_AXIS_QUESTION,
        SCATTER_VIZ_QUESTION,
        PIE_CHART_QUESTION,
      ],
      cards: [
        {
          col: 0,
          row: 0,
          size_x: 24,
          size_y: 6,
        },
        {
          col: 0,
          row: 6,
          size_x: 24,
          size_y: 6,
        },
        {
          col: 0,
          row: 12,
          size_x: 24,
          size_y: 6,
        },
        {
          col: 0,
          row: 18,
          size_x: 24,
          size_y: 6,
        },
        {
          col: 0,
          row: 24,
          size_x: 24,
          size_y: 5,
        },
      ],
    }).then(({ dashboard }) => H.visitDashboard(dashboard.id));

    H.getDashboardCard(0).within(() =>
      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).first().realHover(),
    );
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Doohickey", value: "177" },
        { name: "Gadget", value: "199" },
        { name: "Gizmo", value: "158" },
        { name: "Widget", value: "210" },
      ],
    });

    H.getDashboardCard(0).within(() => {
      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
      H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
      H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);
      H.echartsContainer().within(() => {
        cy.findByText("Count").should("exist"); // y-axis label
        cy.findByText("Created At: Year").should("exist"); // x-axis label

        // some y-axis values
        cy.findByText("1,800").should("exist");
        cy.findByText("1,500").should("exist");
        cy.findByText("1,200").should("exist");
      });

      hideSeries(1); // Gadget
      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
      H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

      hideSeries(2); // Gizmo
      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);
    });

    H.getDashboardCard(0).within(() =>
      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).first().realHover(),
    );
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Doohickey", value: "177" },
        { name: "Widget", value: "210" },
      ],
    });

    H.getDashboardCard(0).within(() => {
      hideSeries(3); // Widget
      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

      hideSeries(0);
      // Ensure can't hide the last visible series
      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

      H.echartsContainer().within(() => {
        cy.findByText("Count").should("exist"); // y-axis label
        cy.findByText("Created At: Year").should("exist"); // x-axis label

        // Ensure y-axis adjusts to visible series range
        cy.findByText("1,800").should("not.exist");
        cy.findByText("1,500").should("exist");
        cy.findByText("1,200").should("exist");
      });

      showSeries(1);
      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
      H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

      H.echartsContainer().within(() => {
        cy.findByText("Count").should("exist"); // y-axis label
        cy.findByText("Created At: Year").should("exist"); // x-axis label
        cy.findByText("1,800").should("exist");
        cy.findByText("1,500").should("exist");
        cy.findByText("1,200").should("exist");
      });

      showSeries(2);
      showSeries(3);
    });

    H.getDashboardCard(1).within(() => {
      H.echartsContainer().findByText("500").should("exist"); // max y-axis value
      cy.findByText("And 39 more").click();
    });
    H.popover().within(() => hideSeries(29)); // TX (Texas);
    H.getDashboardCard(1).click(); // click outside of popover to close it
    H.getDashboardCard(1).within(() =>
      H.echartsContainer().findByText("500").should("not.exist"),
    );

    H.getDashboardCard(2).within(() => {
      H.echartsContainer().within(() => {
        // left axis
        cy.findByText("Sum of Total").should("exist");
        cy.findByText("600,000").should("exist");

        // right axis
        cy.findByText("Sum of Quantity").should("exist");
        cy.findByText("30,000").should("exist");
      });
      H.trendLine().should("have.length", 2);

      hideSeries(0); // Sum of Total

      H.echartsContainer().within(() => {
        // left axis
        cy.findByText("Sum of Total").should("not.exist");
        cy.findByText("600,000").should("not.exist");

        // right axis
        cy.findByText("Sum of Quantity").should("exist");
        cy.findByText("30,000").should("exist");
      });
      H.trendLine().should("have.length", 1);

      showSeries(0);
      hideSeries(1);

      H.echartsContainer().within(() => {
        // left axis
        cy.findByText("Sum of Total").should("exist");
        cy.findByText("600,000").should("exist");

        // right axis
        cy.findByText("Sum of Quantity").should("not.exist");
        cy.findByText("30,000").should("not.exist");
      });
      H.trendLine().should("have.length", 1);
    });

    H.getDashboardCard(3).within(() => {
      H.scatterBubbleWithColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.scatterBubbleWithColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
      H.scatterBubbleWithColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
      H.scatterBubbleWithColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

      H.echartsContainer().findByText("54").should("exist"); // max y-axis value

      hideSeries(1); // Gadget
      hideSeries(2); // Gizmo
      hideSeries(3); // Widget

      H.scatterBubbleWithColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.scatterBubbleWithColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      H.scatterBubbleWithColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      H.scatterBubbleWithColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

      H.echartsContainer().within(() => {
        cy.findByText("54").should("not.exist"); // old max y-axis value
        cy.findByText("42").should("exist"); // new max y-axis value
      });
    });

    H.getDashboardCard(4).within(() => {
      cy.findByText("18,760").should("exist"); // total value
      H.pieSlices().should("have.length", 4);
      getPieChartLegendItemPercentage("TX").should("have.text", "7.15%");

      hideSeries(0); // TX (Texas)

      H.pieSlices().should("have.length", 3);
      cy.findByText("18,760").should("not.exist");
      cy.findByText("17,418").should("exist");
      getPieChartLegendItemPercentage("TX").should("have.text", "");

      hideSeries(3); // "Other" slice

      H.pieSlices().should("have.length", 2);
      cy.findByText("17,418").should("not.exist");
      cy.findByText("1,660").should("exist");
      getPieChartLegendItemPercentage("Other").should("have.text", "");
      getPieChartLegendItemPercentage("MT").should("have.text", "52.5%");
      getPieChartLegendItemPercentage("MN").should("have.text", "47.5%");

      showSeries(0);

      H.pieSlices().should("have.length", 3);
      getPieChartLegendItemPercentage("TX").should("have.text", "44.7%");
    });

    // Ensure can't toggle series visibility in edit mode
    H.editDashboard();

    function ensureCanNotToggleSeriesVisibility() {
      cy.findAllByTestId("legend-item").eq(0).as("legend-item");

      cy.get("@legend-item").findByLabelText("Hide series").should("not.exist");
      cy.get("@legend-item")
        .findByTestId("legend-item-dot")
        .click({ force: true });

      H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should(
        "have.length",
        5,
      );
      H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
      H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
      H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);
    }

    H.showDashboardCardActions(0);
    H.getDashboardCard(0).findByLabelText("Show visualization options").click();

    H.modal().within(() => {
      ensureCanNotToggleSeriesVisibility();
      cy.button("Cancel").click();
    });

    H.showDashboardCardActions(0);
    H.getDashboardCard(0).findByLabelText("Add series").click();

    H.modal().within(() => {
      ensureCanNotToggleSeriesVisibility();
      cy.button("Cancel").click();
    });

    H.getDashboardCard(0).within(() => {
      ensureCanNotToggleSeriesVisibility();
    });
  });

  it("should toggle series visibility on a public dashboard", () => {
    cy.createDashboardWithQuestions({
      questions: [SINGLE_AGGREGATION_QUESTION],
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

      // some y-axis values
      cy.findByText("1,800").should("exist");
      cy.findByText("1,500").should("exist");
      cy.findByText("1,200").should("exist");
    });

    hideSeries(1); // Gadget
    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);
  });

  it("should toggle series visibility in the query builder", () => {
    H.createQuestion(SINGLE_AGGREGATION_QUESTION, { visitQuestion: true });

    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).first().realHover();
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Doohickey", value: "177" },
        { name: "Gadget", value: "199" },
        { name: "Gizmo", value: "158" },
        { name: "Widget", value: "210" },
      ],
    });

    H.echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis label
      cy.findByText("Created At: Year").should("exist"); // x-axis label

      // some y-axis values
      cy.findByText("1,800").should("exist");
      cy.findByText("1,500").should("exist");
      cy.findByText("1,200").should("exist");
    });

    hideSeries(1); // Gadget
    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

    hideSeries(2); // Gizmo
    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).first().realHover();
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Doohickey", value: "177" },
        { name: "Widget", value: "210" },
      ],
    });

    hideSeries(3); // Widget
    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

    hideSeries(0);
    // Ensure can't hide the last visible series
    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

    H.echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis label
      cy.findByText("Created At: Year").should("exist"); // x-axis label

      // Ensure y-axis adjusts to visible series range
      cy.findByText("1,800").should("not.exist");
      cy.findByText("1,500").should("exist");
      cy.findByText("1,200").should("exist");
    });

    showSeries(1);
    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
    H.chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
    H.chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

    H.echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis label
      cy.findByText("Created At: Year").should("exist"); // x-axis label
      cy.findByText("1,800").should("exist");
      cy.findByText("1,500").should("exist");
      cy.findByText("1,200").should("exist");
    });

    showSeries(2);
    showSeries(3);

    H.openVizSettingsSidebar();

    H.leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Stack - 100%").click();
    });
    cy.wait(500);

    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).first().realHover();
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Doohickey", value: "177", secondaryValue: "23.79 %" },
        { name: "Gadget", value: "199", secondaryValue: "26.75 %" },
        { name: "Gizmo", value: "158", secondaryValue: "21.24 %" },
        { name: "Widget", value: "210", secondaryValue: "28.23 %" },
      ],
      footer: { name: "Total", value: "744", secondaryValue: "100 %" },
    });

    hideSeries(2); // Gizmo
    hideSeries(3); // Widget

    H.chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).first().realHover();
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Doohickey", value: "177", secondaryValue: "47.07 %" },
        { name: "Gadget", value: "199", secondaryValue: "52.93 %" },
      ],
      footer: { name: "Total", value: "376", secondaryValue: "100 %" },
    });
  });
});

function hideSeries(legendItemIndex) {
  cy.findAllByTestId("legend-item")
    .eq(legendItemIndex)
    .findByLabelText("Hide series")
    .click();
}

function showSeries(legendItemIndex) {
  cy.findAllByTestId("legend-item")
    .eq(legendItemIndex)
    .findByLabelText("Show series")
    .click();
}

function getPieChartLegendItemPercentage(sliceName) {
  // ChartWithLegend actually renders two legend elements for visual balance
  // https://github.com/metabase/metabase/blob/9053d6fe2b8a9500e67559d35d39259a8a87c4f6/frontend/src/metabase/visualizations/components/ChartWithLegend.jsx#L140
  return cy.findAllByTestId(`legend-item-${sliceName}`).eq(0).children().eq(1);
}
