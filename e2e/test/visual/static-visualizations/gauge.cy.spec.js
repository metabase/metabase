import {
  openEmailPage,
  restore,
  sendSubscriptionsEmail,
  setupSMTP,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";
import { createGaugeQuestion } from "e2e/support/helpers/e2e-visualization-helpers";

const { admin } = USERS;

describe("static visualizations", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("gauge chart", () => {
    const dashboardName = "Gauge bar charts dashboard";
    cy.createDashboardWithQuestions({
      dashboardName,
      questions: [
        createGaugeQuestion([0, 9380, 18760, 37520]),
        createGaugeQuestion([0, 9380, 18760, 37520], undefined, {
          '["name","count"]': {
            number_style: "currency",
            number_separators: ".’",
            scale: 2,
            prefix: "<",
            suffix: ">",
            decimals: 1,
          },
        }),
        createGaugeQuestion(
          [0, 9380, 18760, 37520],
          ["I am a very very long label", "Not long label", "Label"],
        ),
        createGaugeQuestion([0, 9380, 18760, 30000]),
        createGaugeQuestion([0, 9380, 18760, 37520, 75040]),
        createGaugeQuestion([20000, 30000, 40000]),
        createGaugeQuestion([0, 5000, 10000]),
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
