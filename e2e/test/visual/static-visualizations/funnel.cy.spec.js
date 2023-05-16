import {
  restore,
  setupSMTP,
  openEmailPage,
  sendSubscriptionsEmail,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS, SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { admin } = USERS;

describe("static visualizations", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("funnel bar chart", () => {
    const dashboardName = "Funnel bar charts dashboard";
    cy.createDashboardWithQuestions({
      dashboardName,
      questions: [createFunnelBarQuestion()],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);

      sendSubscriptionsEmail(`${admin.first_name} ${admin.last_name}`);

      openEmailPage(dashboardName).then(() => {
        cy.createPercySnapshot();
      });
    });
  });
});

function createFunnelBarQuestion() {
  const query = {
    name: `funnel`,
    native: {
      query: `SELECT * FROM ( VALUES ('Stage 1', 1000), ('Stage 2', 400), ('Stage 3', 250), ('Stage 4', 100), ('Stage 5', 20), ('Stage 6', 10))`,
      "template-tags": {},
    },
    visualization_settings: {},
    display: "funnel",
    database: SAMPLE_DB_ID,
  };

  return query;
}
