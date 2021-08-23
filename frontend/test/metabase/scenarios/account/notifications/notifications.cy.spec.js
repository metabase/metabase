import { restore } from "__support__/e2e/helpers/e2e-setup-helpers";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const questionDetails = {
  name: "Question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
    ],
  },
};

const dashboardDetails = {
  name: "Dashboard",
};

describe("scenarios > account > notifications", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("alerts", () => {
    beforeEach(() => {
      cy.getCurrentUser().then(({ body: { id: user_id } }) => {
        cy.createQuestion(questionDetails).then(({ body: { id: card_id } }) => {
          cy.createAlert({
            card: {
              id: card_id,
              include_csv: false,
              include_xls: false,
            },
            channels: [
              {
                enabled: true,
                channel_type: "email",
                schedule_type: "hourly",
                recipients: [
                  {
                    id: user_id,
                  },
                ],
              },
            ],
          });
        });
      });
    });

    it("should be able to see help info", () => {
      cy.visit("/account/notifications");

      cy.findByText("Not seeing one here?").click();
      cy.findByText("Not seeing something listed here?");
      cy.findByText("Got it").click();
      cy.findByText("Not seeing something listed here?").should("not.exist");
    });

    it("should be able to see alerts notifications", () => {
      cy.visit("/account/notifications");

      cy.findByText("Question");
      cy.findByText("Emailed hourly", { exact: false });
      cy.findByText("Created by you", { exact: false });
    });

    it("should be able to unsubscribe and delete an alert", () => {
      cy.findByText("Question");
      cy.findByLabelText("close icon").click();

      cy.findByText("Confirm you want to unsubscribe");
      cy.findByText("Unsubscribe").click();

      cy.findByText("You’re unsubscribed. Delete this alert as well?");
      cy.findByText("Delete this alert").click();

      cy.findByText("Question").should("not.exist");
    });
  });

  describe("pulses", () => {
    beforeEach(() => {
      cy.getCurrentUser().then(({ body: { id: user_id } }) => {
        cy.createQuestionAndDashboard({
          questionDetails,
          dashboardDetails,
        }).then(({ body: { card_id, dashboard_id } }) => {
          cy.createPulse({
            name: "Pulse",
            dashboard_id,
            cards: [
              {
                id: card_id,
                include_csv: false,
                include_xls: false,
              },
            ],
            channels: [
              {
                enabled: true,
                channel_type: "slack",
                schedule_type: "hourly",
                recipients: [
                  {
                    id: user_id,
                  },
                ],
              },
            ],
          });
        });
      });
    });

    it("should be able to see help info", () => {
      cy.visit("/account/notifications");

      cy.findByText("Not seeing one here?").click();
      cy.findByText("Not seeing something listed here?");
      cy.findByText("Got it").click();
      cy.findByText("Not seeing something listed here?").should("not.exist");
    });

    it("should be able to see pulses notifications", () => {
      cy.visit("/account/notifications");

      cy.findByText("Dashboard");
      cy.findByText("Slack’d hourly", { exact: false });
      cy.findByText("Created by you", { exact: false });
    });

    it("should be able to unsubscribe and delete a pulse", () => {
      cy.findByText("Dashboard");
      cy.findByLabelText("close icon").click();

      cy.findByText("Confirm you want to unsubscribe");
      cy.findByText("Unsubscribe").click();

      cy.findByText("You’re unsubscribed. Delete this subscription as well?");
      cy.findByText("Delete this subscription").click();

      cy.findByText("Dashboard").should("not.exist");
    });
  });
});
