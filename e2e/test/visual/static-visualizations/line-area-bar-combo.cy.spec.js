import {
  restore,
  setupSMTP,
  openEmailPage,
  sendSubscriptionsEmail,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

const { admin } = USERS;

const visualizationTypes = ["line", "area", "bar", "combo"];

describe("static visualizations", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  visualizationTypes.map(visualizationType => {
    it(`${visualizationType} chart`, () => {
      const dashboardName = `${visualizationType} charts dashboard`;
      cy.createDashboardWithQuestions({
        dashboardName,
        questions: [
          createOneDimensionOneMetricQuestion(visualizationType),
          createOneMetricTwoDimensionsQuestion(visualizationType),
          createOneDimensionTwoMetricsQuestion(visualizationType),
        ],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);

        sendSubscriptionsEmail(`${admin.first_name} ${admin.last_name}`);

        openEmailPage(dashboardName).then(() => {
          cy.createPercySnapshot();
        });
      });
    });
  });
});

function createOneDimensionOneMetricQuestion(display) {
  return {
    name: `${display} one dimension one metric`,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
      "graph.show_values": true,
    },
    display: display,
    database: SAMPLE_DB_ID,
  };
}

function createOneDimensionTwoMetricsQuestion(display) {
  return {
    name: `${display} one dimension two metrics`,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count", "avg"],
      "graph.show_values": true,
    },
    display: display,
    database: SAMPLE_DB_ID,
  };
}

function createOneMetricTwoDimensionsQuestion(visualizationType) {
  return {
    name: `${visualizationType} one metric two dimensions`,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
      "graph.metrics": ["count"],
      "graph.show_values": true,
    },
    display: visualizationType,
    database: SAMPLE_DB_ID,
  };
}
