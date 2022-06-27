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

  it("progress bar chart", () => {
    const dashboardName = "Progress bar charts dashboard";
    cy.createDashboardWithQuestions({
      dashboardName,
      questions: [
        createProgressBarQuestion({ value: 0, goal: 1000 }),
        createProgressBarQuestion({ value: 500, goal: 1000 }),
        createProgressBarQuestion({ value: 1000, goal: 1000 }),
        createProgressBarQuestion({ value: 2000, goal: 1000 }),
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

function createProgressBarQuestion({ value, goal }) {
  const query = {
    name: `progress bar value=${value} goal=${goal}`,
    native: {
      query: `SELECT ${value}`,
      "template-tags": {},
    },
    visualization_settings: {
      "progress.goal": goal,
    },
    display: "progress",
    database: SAMPLE_DB_ID,
  };

  return query;
}
