import {
  openEmailPage,
  restore,
  sendSubscriptionsEmail,
  setupSMTP,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";
import { createFunnelBarQuestion } from "e2e/support/helpers/e2e-visualization-helpers";

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
