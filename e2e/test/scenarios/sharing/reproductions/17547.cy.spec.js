import { restore, popover, visitQuestion } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
    ],
    aggregation: [["count"]],
  },
  display: "area",
};

describe("issue 17547", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id: questionId } }) => {
      setUpAlert(questionId);

      visitQuestion(questionId);
    });
  });

  it("editing an alert should not delete it (metabase#17547)", () => {
    cy.icon("bell").click();
    popover().within(() => {
      cy.findByText("Daily, 12:00 PM");
      cy.findByText("Edit").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("AM").click();
    cy.button("Save changes").click();

    cy.wait("@alertQuery");

    cy.icon("bell").click();
    popover().within(() => {
      cy.findByText("Daily, 12:00 AM");
    });
  });
});

function setUpAlert(questionId) {
  cy.request("POST", "/api/alert", {
    channels: [
      {
        schedule_type: "daily",
        schedule_hour: 12,
        channel_type: "slack",
        schedule_frame: null,
        recipients: [],
        details: { channel: "#work" },
        pulse_id: 1,
        id: 1,
        schedule_day: null,
        enabled: true,
      },
    ],
    alert_condition: "rows",
    name: null,
    creator_id: 1,
    card: { id: questionId, include_csv: true, include_xls: false },
    alert_first_only: false,
    skip_if_empty: true,
    parameters: [],
    dashboard_id: null,
  }).then(({ body: { id: alertId } }) => {
    cy.intercept("PUT", `/api/alert/${alertId}`).as("alertQuery");
  });
}
