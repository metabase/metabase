import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  chartPathWithFillColor,
  createQuestion,
  echartsContainer,
  getDashboardCard,
  popover,
  restore,
  scatterBubbleWithColor,
  trendLine,
  visitDashboard,
} from "e2e/support/helpers";

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
    restore();
    cy.signInAsAdmin();
  });

  it("should toggle series visibility on a dashboard", () => {
    cy.createDashboardWithQuestions({
      questions: [
        SINGLE_AGGREGATION_QUESTION,
        MANY_LEGEND_ITEMS_QUESTION,
        SPLIT_AXIS_QUESTION,
        SCATTER_VIZ_QUESTION,
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
      ],
    }).then(({ dashboard }) => visitDashboard(dashboard.id));

    getDashboardCard(0).within(() => {
      chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);
      echartsContainer().within(() => {
        cy.findByText("Count").should("exist"); // y-axis label
        cy.findByText("Created At").should("exist"); // x-axis label

        // some y-axis values
        cy.findByText("1,800").should("exist");
        cy.findByText("1,500").should("exist");
        cy.findByText("1,200").should("exist");
      });

      hideSeries(1); // Gadget
      chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

      hideSeries(2); // Gizmo
      chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

      hideSeries(3); // Widget
      chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

      hideSeries(0);
      // Ensure can't hide the last visible series
      chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

      echartsContainer().within(() => {
        cy.findByText("Count").should("exist"); // y-axis label
        cy.findByText("Created At").should("exist"); // x-axis label

        // Ensure y-axis adjusts to visible series range
        cy.findByText("1,800").should("not.exist");
        cy.findByText("1,500").should("exist");
        cy.findByText("1,200").should("exist");
      });

      showSeries(1);
      chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
      chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

      echartsContainer().within(() => {
        cy.findByText("Count").should("exist"); // y-axis label
        cy.findByText("Created At").should("exist"); // x-axis label
        cy.findByText("1,800").should("exist");
        cy.findByText("1,500").should("exist");
        cy.findByText("1,200").should("exist");
      });
    });

    getDashboardCard(1).within(() => {
      echartsContainer().findByText("500").should("exist"); // max y-axis value
      cy.findByText("And 39 more").click();
    });
    popover().within(() => hideSeries(29)); // TX (Texas);
    getDashboardCard(1).click(); // click outside of popover to close it
    getDashboardCard(1).within(() =>
      echartsContainer().findByText("500").should("not.exist"),
    );

    getDashboardCard(2).within(() => {
      echartsContainer().within(() => {
        // left axis
        cy.findByText("Sum of Total").should("exist");
        cy.findByText("600,000").should("exist");

        // right axis
        cy.findByText("Sum of Quantity").should("exist");
        cy.findByText("30,000").should("exist");
      });
      trendLine().should("have.length", 2);

      hideSeries(0); // Sum of Total

      echartsContainer().within(() => {
        // left axis
        cy.findByText("Sum of Total").should("not.exist");
        cy.findByText("600,000").should("not.exist");

        // right axis
        cy.findByText("Sum of Quantity").should("exist");
        cy.findByText("30,000").should("exist");
      });
      trendLine().should("have.length", 1);

      showSeries(0);
      hideSeries(1);

      echartsContainer().within(() => {
        // left axis
        cy.findByText("Sum of Total").should("exist");
        cy.findByText("600,000").should("exist");

        // right axis
        cy.findByText("Sum of Quantity").should("not.exist");
        cy.findByText("30,000").should("not.exist");
      });
      trendLine().should("have.length", 1);
    });

    getDashboardCard(3).within(() => {
      scatterBubbleWithColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
      scatterBubbleWithColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
      scatterBubbleWithColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
      scatterBubbleWithColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

      echartsContainer().findByText("54").should("exist"); // max y-axis value

      hideSeries(1); // Gadget
      hideSeries(2); // Gizmo
      hideSeries(3); // Widget

      scatterBubbleWithColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
      scatterBubbleWithColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
      scatterBubbleWithColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
      scatterBubbleWithColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

      echartsContainer().within(() => {
        cy.findByText("54").should("not.exist"); // old max y-axis value
        cy.findByText("42").should("exist"); // new max y-axis value
      });
    });
  });

  it("should toggle series visibility in the query builder", () => {
    createQuestion(SINGLE_AGGREGATION_QUESTION, { visitQuestion: true });

    chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);
    echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis label
      cy.findByText("Created At").should("exist"); // x-axis label

      // some y-axis values
      cy.findByText("1,800").should("exist");
      cy.findByText("1,500").should("exist");
      cy.findByText("1,200").should("exist");
    });

    hideSeries(1); // Gadget
    chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

    hideSeries(2); // Gizmo
    chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
    chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 5);

    hideSeries(3); // Widget
    chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
    chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

    hideSeries(0);
    // Ensure can't hide the last visible series
    chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 0);
    chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
    chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

    echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis label
      cy.findByText("Created At").should("exist"); // x-axis label

      // Ensure y-axis adjusts to visible series range
      cy.findByText("1,800").should("not.exist");
      cy.findByText("1,500").should("exist");
      cy.findByText("1,200").should("exist");
    });

    showSeries(1);
    chartPathWithFillColor(CATEGORY_COLOR.DOOHICKEY).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.GADGET).should("have.length", 5);
    chartPathWithFillColor(CATEGORY_COLOR.GIZMO).should("have.length", 0);
    chartPathWithFillColor(CATEGORY_COLOR.WIDGET).should("have.length", 0);

    echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis label
      cy.findByText("Created At").should("exist"); // x-axis label
      cy.findByText("1,800").should("exist");
      cy.findByText("1,500").should("exist");
      cy.findByText("1,200").should("exist");
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
