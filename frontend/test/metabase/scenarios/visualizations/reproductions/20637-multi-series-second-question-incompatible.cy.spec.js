import {
  restore,
  editDashboard,
  showDashboardCardActions,
} from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  name: "First Series",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  display: "line",
};

const secondSeriesQuestion = {
  name: "Second Series",
  query: {
    "source-table": PEOPLE_ID,
    aggregation: [["count"]],
    breakout: [["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }]],
  },
  display: "line",
};

describe.skip("issue 20637", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/collection/root").as("rootCollection");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(secondSeriesQuestion);
  });

  it("should be able to add a second series to the dashboard card (metabase#20637)", () => {
    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
        cy.wait("@rootCollection");
      },
    );

    editDashboard();

    showDashboardCardActions();
    cy.icon("line").click();

    cy.findByText(secondSeriesQuestion.name).click();

    cy.findAllByTestId("legend-item")
      .should("contain", "Count")
      .and("have.length", 2);
  });
});
