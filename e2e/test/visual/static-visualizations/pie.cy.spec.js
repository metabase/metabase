import {
  openEmailPage,
  restore,
  sendSubscriptionsEmail,
  setupSMTP,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";
import { createPieQuestion } from "e2e/support/helpers/e2e-visualization-helpers";

const { admin } = USERS;

describe("static visualizations", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("pie chart", () => {
    const dashboardName = "Pie charts dashboard";
    cy.createDashboardWithQuestions({
      dashboardName,
      questions: [
        createPieQuestion({ percentVisibility: "off " }),
        createPieQuestion({ percentVisibility: "legend" }),
        createPieQuestion({ percentVisibility: "inside" }),
        createPieQuestion({ showTotal: true }),
        createPieQuestion({ showTotal: false }),
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
