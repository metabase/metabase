import {
  restore,
  setupSMTP,
  openEmailPage,
  sendSubscriptionsEmail,
  visitDashboard,
} from "__support__/e2e/helpers";

import { USERS, SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

const { admin } = USERS;

describe("static visualizations", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("waterfall chart", () => {
    const dashboardName = "Waterfall charts dashboard";
    cy.createDashboardWithQuestions({
      dashboardName,
      questions: [
        createWaterfallQuestion(),
        createWaterfallQuestion({ showTotal: true }),
        createWaterfallQuestion({ showTotal: false }),
      ],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);

      sendSubscriptionsEmail(`${admin.first_name} ${admin.last_name}`);

      openEmailPage(dashboardName).then(() => {
        cy.percySnapshot();
      });
    });
  });
});

function createWaterfallQuestion({ showTotal } = {}) {
  const query = {
    name: `waterfall showTotal=${showTotal}`,
    native: {
      query:
        "SELECT * FROM ( VALUES ('Stage 1', 10), ('Stage 2', 30), ('Stage 3', -50), ('Stage 4', -10), ('Stage 5', 80), ('Stage 6', 10), ('Stage 7', 15))",
      "template-tags": {},
    },
    visualization_settings: {},
    display: "waterfall",
    database: SAMPLE_DB_ID,
  };

  if (typeof showTotal !== "undefined") {
    query.visualization_settings["waterfall.show_total"] = showTotal;
  }

  return query;
}
