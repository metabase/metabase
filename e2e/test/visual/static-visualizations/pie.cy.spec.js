import {
  restore,
  setupSMTP,
  openEmailPage,
  sendSubscriptionsEmail,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS, SAMPLE_DB_ID } from "e2e/support/cypress_data";

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

function createPieQuestion({ percentVisibility, showTotal }) {
  const query = {
    name: `pie showDataLabels=${percentVisibility}, showTotal=${showTotal}`,
    native: {
      query:
        "select 1 x, 1000 y\n" +
        "union all select 2, 800\n" +
        "union all select 3, 100\n" +
        "union all select 4, 180\n" +
        "union all select 5, 500\n" +
        "union all select 6, 180\n" +
        "union all select 7, 100\n" +
        "union all select 8, 10\n",
      "template-tags": {},
    },
    visualization_settings: {
      "pie.percent_visibility": percentVisibility,
      "pie.show_total": showTotal,
    },
    display: "pie",
    database: SAMPLE_DB_ID,
  };

  return query;
}
