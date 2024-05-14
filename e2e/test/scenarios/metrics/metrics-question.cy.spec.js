import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertQueryBuilderRowCount,
  cartesianChartCircle,
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  modal,
  popover,
  restore,
  visitMetric,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_TIMESERIES_METRIC = {
  name: "Count of orders over time",
  type: "metric",
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
  },
  display: "line",
};

describe("scenarios > metrics > question", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to add a filter with an ad-hoc question", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    cy.findByTestId("qb-header-action-panel").button("Filter").click();
    modal().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Gadget").click();
      cy.button("Apply filters").click();
    });
    cy.findByTestId("scalar-container")
      .findByText("4,939")
      .should("be.visible");
  });

  it("should be able to add a custom aggregation expression based on a metric", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content")
      .button(ORDERS_TIMESERIES_METRIC.name)
      .click();
    enterCustomColumnDetails({
      formula: `[${ORDERS_TIMESERIES_METRIC.name}] * 2`,
      name: "Expression",
    });
    popover().button("Update").click();
    echartsContainer().findByText("Expression").should("be.visible");
  });

  it("should be able to add a breakout with an ad-hoc question", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content").findByText("Category").click();
    echartsContainer().findByText("Product → Category").should("be.visible");
  });

  it("should be able to change the temporal unit when consuming a timeseries metric", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    assertQueryBuilderRowCount(49);
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content")
      .findByTestId("pinned-dimensions")
      .findByLabelText("Created At")
      .findByText("by month")
      .click();
    popover().findByText("Year").click();
    assertQueryBuilderRowCount(5);
  });

  it("should be able to drill-thru with a metric", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) => {
      visitMetric(card.id);
      cy.wait("@dataset");
    });
    cartesianChartCircle()
      .eq(23) // random dot
      .click({ force: true });
    popover().within(() => {
      cy.findByText("Break out by…").click();
      cy.findByText("Category").click();
      cy.findByText("Source").click();
    });
    cy.wait("@dataset");
    echartsContainer().findByText("User → Source").should("be.visible");
  });

  it("should be able to drill-thru with a metric without the aggregation clause", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) => {
      visitMetric(card.id);
      cy.wait("@dataset");
    });
    cartesianChartCircle()
      .eq(23) // random dot
      .click({ force: true });
    popover().findByText("See these records").click();
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is Mar 1–31, 2024")
      .should("be.visible");
    assertQueryBuilderRowCount(445);
  });
});
