import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import {
  createQuestion,
  echartsContainer,
  getDashboardCard,
  modal,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

type QuestionDetails = StructuredQuestionDetails & { name: string };

const ORDERS_SCALAR_METRIC: QuestionDetails = {
  name: "Count of orders",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_TIMESERIES_METRIC: QuestionDetails = {
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
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

const PRODUCTS_TIMESERIES_METRIC: QuestionDetails = {
  name: "Count of products over time",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PRODUCTS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line",
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

describe("scenarios > metrics > editing", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to add metrics to a dashboard", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    createQuestion(ORDERS_TIMESERIES_METRIC);
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByTestId("dashboard-header").within(() => {
      cy.findByLabelText("Edit dashboard").click();
      cy.findByLabelText("Add questions").click();
    });
    cy.findByTestId("add-card-sidebar").within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      cy.findByPlaceholderText("Search…").type(ORDERS_TIMESERIES_METRIC.name);
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).click();
    });
    getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByText("18,760").should("be.visible");
    });
    getDashboardCard(2).within(() => {
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
      echartsContainer().should("be.visible");
    });
  });

  it("should be able to combine metrics in a dashcard (metabase#42575)", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC);
    createQuestion(PRODUCTS_TIMESERIES_METRIC);
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByTestId("dashboard-header").within(() => {
      cy.findByLabelText("Edit dashboard").click();
      cy.findByLabelText("Add questions").click();
    });
    cy.findByTestId("add-card-sidebar")
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .click();
    getDashboardCard(1).realHover().findByTestId("add-series-button").click();
    modal().within(() => {
      cy.findByText(PRODUCTS_TIMESERIES_METRIC.name).click();
      cy.findByLabelText("Legend").within(() => {
        cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
        cy.findByText(PRODUCTS_TIMESERIES_METRIC.name).should("be.visible");
      });
      cy.button("Done").click();
    });
    saveDashboard();
    getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
      cy.findByText(PRODUCTS_TIMESERIES_METRIC.name).should("be.visible");
    });
  });
});
