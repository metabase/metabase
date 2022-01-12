import { restore, setupSMTP, cypressWaitAll } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS_ID, ORDERS, PRODUCTS } = SAMPLE_DATASET;

const { admin } = USERS;

const visualizationTypes = ["line", "area", "bar", "combo"];

const SENDING_EMAIL_TIMEOUT = 30000;

describe("static visualizations", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  visualizationTypes.map(type => {
    it(`${type} chart`, () => {
      const dashboardName = `${type} charts dashboard`;
      cy.createDashboard({ name: dashboardName })
        .then(({ body: { id: dashboardId } }) => {
          return cypressWaitAll([
            createOneMetricTwoDimensionsQuestion(type, dashboardId),
            createOneDimensionTwoMetricsQuestion(type, dashboardId),
          ]).then(() => {
            cy.visit(`/dashboard/${dashboardId}`);
          });
        })
        .then(() => {
          cy.icon("share").click();
          cy.findByText("Dashboard subscriptions").click();

          cy.findByText("Email it").click();
          cy.findByPlaceholderText("Enter user names or email addresses")
            .click()
            .type(`${admin.first_name} ${admin.last_name}{enter}`)
            .blur();

          cy.button("Send email now").click();
          cy.button("Email sent", SENDING_EMAIL_TIMEOUT);

          openEmailPage(dashboardName).then(() => {
            cy.percySnapshot();
          });
        });
    });
  });
});

function createOneDimensionTwoMetricsQuestion(display, dashboardId) {
  return cy.createQuestionAndAddToDashboard(
    {
      name: `${display} one dimension two metrics`,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count", "avg"],
      },
      display: display,
      database: 1,
    },
    dashboardId,
  );
}

function createOneMetricTwoDimensionsQuestion(display, dashboardId) {
  return cy.createQuestionAndAddToDashboard(
    {
      name: `${display} one metric two dimensions`,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["count"],
      },
      display: display,
      database: 1,
    },
    dashboardId,
  );
}

function openEmailPage(emailSubject) {
  cy.window().then(win => (win.location.href = "http://localhost"));
  cy.findByText(emailSubject).click();

  return cy.hash().then(path => {
    const htmlPath = `http://localhost${path.slice(1)}/html`;
    cy.window().then(win => (win.location.href = htmlPath));
    cy.findByText(emailSubject);
  });
}
