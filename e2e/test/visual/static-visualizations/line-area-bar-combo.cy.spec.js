import {
  openEmailPage,
  restore,
  sendSubscriptionsEmail,
  setupSMTP,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";
import {
  createOneDimensionOneMetricQuestion,
  createOneDimensionTwoMetricsQuestion,
  createOneMetricTwoDimensionsQuestion,
} from "e2e/support/helpers/e2e-visualization-helpers";

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
