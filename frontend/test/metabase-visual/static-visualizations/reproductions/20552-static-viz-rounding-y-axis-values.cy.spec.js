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
  name: "20552",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["avg", ["field", PRODUCTS.RATING, null]]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  display: "bar",
};

const dashboardName = "20552D";
const dashboardDetails = { name: dashboardName };

describe.skip("issue 20552", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();
  });

  it("shouldn't round Y-axis values (metabase#20552)", () => {
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
