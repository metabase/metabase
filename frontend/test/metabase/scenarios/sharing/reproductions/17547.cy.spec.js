import { restore, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATASET;

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

describe.skip("issue 17547", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id: questionId } }) => {
      cy.intercept("POST", `/api/card/${questionId}/query`).as("cardQuery");

      setUpAlert(questionId);

      cy.visit(`/question/${questionId}`);
      cy.wait("@cardQuery");
    });
  });

  it("editing an alert should not delete it (metabase#17547)", () => {
    cy.icon("bell").click();
    popover().within(() => {
      cy.findByText("Daily, 12:00 PM");
      cy.findByText("Edit").click();
    });

    cy.findByText("AM").click();
    cy.button("Save changes").click();

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
  });
}
