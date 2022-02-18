import {
  restore,
  setupSMTP,
  sendSubscriptionsEmail,
  openEmailPage,
} from "__support__/e2e/cypress";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { USERS } from "__support__/e2e/cypress_data";

const {
  admin: { first_name, last_name },
} = USERS;
const FULL_NAME = `${first_name} ${last_name}`;

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "20559",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["sum", ["field", PRODUCTS.PRICE, null]]],
    breakout: [
      [
        "field",
        PRODUCTS.CREATED_AT,
        {
          "temporal-unit": "year",
        },
      ],
      ["field", PRODUCTS.CATEGORY, null],
    ],
  },
  display: "line",
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT", "CATEGORY"],
    "graph.metrics": ["sum"],
  },
};

const dashboardName = "20559D";
const dashboardDetails = { name: dashboardName };

describe.skip("issue 20559", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();
  });

  it("shouldn show only one Y-axis for multi-series visualization (metabase#20559)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );

    sendSubscriptionsEmail(FULL_NAME);

    openEmailPage(dashboardName).then(() => {
      cy.percySnapshot();
    });
  });
});
