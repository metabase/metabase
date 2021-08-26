import { restore } from "__support__/e2e/helpers/e2e-setup-helpers";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS_ID } = SAMPLE_DATASET;

const getQuestionDetails = () => ({
  name: "Question",
  query: {
    "source-table": ORDERS_ID,
  },
});

const getAlertDetails = ({ user_id, card_id }) => ({
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

const getPulseDetails = ({ card_id, dashboard_id }) => ({
  name: "Subscription",
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
    },
  ],
});

describe("scenarios > account > notifications", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("alerts", () => {
    beforeEach(() => {
      cy.getCurrentUser().then(({ body: { id: user_id } }) => {
        cy.createQuestion(getQuestionDetails()).then(
          ({ body: { id: card_id } }) => {
            cy.createAlert(getAlertDetails({ user_id, card_id }));
          },
        );
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
      cy.visit("/account/notifications");

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
          questionDetails: getQuestionDetails(),
        }).then(({ body: { card_id, dashboard_id } }) => {
          cy.createPulse(getPulseDetails({ card_id, dashboard_id }));
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

      cy.findByText("Subscription");
      cy.findByText("Slack’d hourly", { exact: false });
      cy.findByText("Created by you", { exact: false });
    });

    it("should be able to unsubscribe and delete a pulse", () => {
      cy.visit("/account/notifications");

      cy.findByText("Subscription");
      cy.findByLabelText("close icon").click();

      cy.findByText("Delete this subscription?");
      cy.findByText("Yes, delete this subscription").click();

      cy.findByText("Subscription").should("not.exist");
    });
  });
});
