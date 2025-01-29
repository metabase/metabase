import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const getQuestionDetails = () => ({
  name: "Question",
  query: {
    "source-table": ORDERS_ID,
  },
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
    H.restore();
  });

  describe("notifications", () => {
    beforeEach(() => {
      cy.signInAsAdmin().then(() => {
        H.getCurrentUser().then(({ body: { id: admin_id } }) => {
          cy.signInAsNormalUser().then(() => {
            H.getCurrentUser().then(({ body: { id: user_id } }) => {
              H.createQuestion(getQuestionDetails()).then(
                ({ body: { id: card_id } }) => {
                  H.createQuestionAlert({
                    user_id: admin_id,
                    card_id,
                    handlers: [
                      {
                        channel_type: "channel/email",
                        recipients: [
                          {
                            type: "notification-recipient/user",
                            user_id,
                            details: null,
                          },
                          {
                            type: "notification-recipient/user",
                            user_id: admin_id,
                            details: null,
                          },
                        ],
                      },
                    ],
                  });
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

      H.modal().within(() => {
        cy.findByText("Not seeing something listed here?");
        cy.findByText("Got it").click();
      });

      H.modal().should("not.exist");
    });

    it("should be able to see alerts notifications", () => {
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Daily at 9:00 am", { exact: false });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created by you", { exact: false });
    });

    it("should be able to delete an alert when the user created it and he is a single recipient", () => {
      openUserNotifications();

      cy.intercept("GET", "/api/notification/*").as("getAlert");
      cy.intercept("POST", "/api/notification/*/unsubscribe").as(
        "alertUnsubscribe",
      );
      cy.intercept("PUT", "/api/notification/*").as("alertDelete");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question");
      clickUnsubscribe();

      cy.wait("@getAlert");

      cy.findByTestId("alert-unsubscribe").within(() => {
        cy.findByText("Confirm you want to unsubscribe");
        cy.findByText("Unsubscribe").click();
      });

      cy.wait("@alertUnsubscribe");
      H.undoToastList()
        .findByText("Successfully unsubscribed.")
        .should("exist");

      cy.findByTestId("alert-delete").within(() => {
        cy.findByText("You’re unsubscribed. Delete this alert as well?");
        cy.findByText("Delete it").click();
      });

      cy.wait("@alertDelete");
      H.undoToastList()
        .last()
        .findByText("The alert was successfully deleted.")
        .should("exist");

      H.modal().should("not.exist");
      cy.findByTestId("notification-list").should("not.exist");
    });

    it("should be able to unsubscribe from an alert when the user has not created it", () => {
      cy.signOut();
      cy.signInAsAdmin();
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question");
      clickUnsubscribe();

      H.modal()
        .last()
        .within(() => {
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
        H.createQuestionAndDashboard({
          questionDetails: getQuestionDetails(),
        }).then(({ body: { card_id, dashboard_id } }) => {
          H.createPulse(getPulseDetails({ card_id, dashboard_id }));
        });
      });
    });

    it("should be able to see help info", () => {
      openUserNotifications();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Not seeing one here?").click();

      H.modal().within(() => {
        cy.findByText("Not seeing something listed here?");
        cy.findByText("Got it").click();
      });

      H.modal().should("not.exist");
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

      H.modal().within(() => {
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
