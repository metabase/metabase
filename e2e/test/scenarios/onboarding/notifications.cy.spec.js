import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers/e2e-setup-helpers";
import { modal } from "e2e/support/helpers/e2e-ui-elements-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const getQuestionDetails = () => ({
  name: "Question",
  query: {
    "source-table": ORDERS_ID,
  },
});

const getAlertDetails = ({ card_id, user_id, admin_id }) => ({
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
        {
          id: admin_id,
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
  });

  describe("alerts", () => {
    beforeEach(() => {
      cy.signInAsAdmin().then(() => {
        cy.getCurrentUser().then(({ body: { id: admin_id } }) => {
          cy.signInAsNormalUser().then(() => {
            cy.getCurrentUser().then(({ body: { id: user_id } }) => {
              cy.createQuestion(getQuestionDetails()).then(
                ({ body: { id: card_id } }) => {
                  cy.createAlert(
                    getAlertDetails({ card_id, user_id, admin_id }),
                  );
                },
              );
            });
          });
        });
      });
    });

    it("should be able to see help info", () => {
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Not seeing one here?").click();

      modal().within(() => {
        cy.findByText("Not seeing something listed here?");
        cy.findByText("Got it").click();
      });

      modal().should("not.exist");
    });

    it("should be able to see alerts notifications", () => {
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Emailed hourly", { exact: false });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created by you", { exact: false });
    });

    it("should be able to unsubscribe and delete an alert when the user created it", () => {
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question");
      clickUnsubscribe();

      modal().within(() => {
        cy.findByText("Confirm you want to unsubscribe");
        cy.findByText("Unsubscribe").click();
        cy.findByText("Unsubscribe").should("not.exist");
      });

      modal().within(() => {
        cy.findByText("You’re unsubscribed. Delete this alert as well?");
        cy.findByText("Delete this alert").click();
      });

      modal().should("not.exist");
      cy.findByTestId("notification-list").should("not.exist");
    });

    it("should be able to unsubscribe from an alert when the user has not created it", () => {
      cy.signOut();
      cy.signInAsAdmin();
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question");
      clickUnsubscribe();

      modal().within(() => {
        cy.findByText("Confirm you want to unsubscribe");
        cy.findByText("Unsubscribe").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question").should("not.exist");
    });
  });

  describe("pulses", () => {
    beforeEach(() => {
      cy.signInAsNormalUser().then(() => {
        cy.createQuestionAndDashboard({
          questionDetails: getQuestionDetails(),
        }).then(({ body: { card_id, dashboard_id } }) => {
          cy.createPulse(getPulseDetails({ card_id, dashboard_id }));
        });
      });
    });

    it("should be able to see help info", () => {
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Not seeing one here?").click();

      modal().within(() => {
        cy.findByText("Not seeing something listed here?");
        cy.findByText("Got it").click();
      });

      modal().should("not.exist");
    });

    it("should be able to see pulses notifications", () => {
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Subscription");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Slack’d hourly", { exact: false });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created by you", { exact: false });
    });

    it("should be able to unsubscribe and delete a pulse when the user has created it", () => {
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Subscription");
      clickUnsubscribe();

      modal().within(() => {
        cy.findByText("Delete this subscription?");
        cy.findByText("Yes, delete this subscription").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Subscription").should("not.exist");
    });
  });
});

function clickUnsubscribe() {
  cy.findByTestId("notifications-list").within(() => {
    cy.findByLabelText("close icon").click();
  });
}

function openUserNotifications() {
  cy.intercept("GET", "/api/pulse?*").as("loadSubscriptions");
  cy.visit("/account/notifications");
  cy.wait("@loadSubscriptions");
}
