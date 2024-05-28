import {
  ORDERS_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  setupSMTP,
  mockSlackConfigured,
  visitQuestion,
} from "e2e/support/helpers";

const channels = { slack: mockSlackConfigured, email: setupSMTP };

describe("scenarios > alert", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("with nothing set", () => {
    it("should prompt you to add email/slack credentials", () => {
      visitQuestion(ORDERS_QUESTION_ID);
      cy.icon("bell").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "To send alerts, you'll need to set up email or Slack integration.",
      );
    });

    it("should say to non-admins that admin must add email credentials", () => {
      cy.signInAsNormalUser();

      visitQuestion(ORDERS_QUESTION_ID);
      cy.icon("bell").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      );
    });
  });

  Object.entries(channels).forEach(([channel, setup]) => {
    describe(`with ${channel} set up`, { tags: "@external" }, () => {
      beforeEach(setup);

      it("educational screen should show for the first alert, but not for the second", () => {
        cy.intercept("POST", "/api/alert").as("savedAlert");
        cy.intercept("POST", `/api/card/${ORDERS_COUNT_QUESTION_ID}/query`).as(
          "questionLoaded",
        );

        // Open the first alert screen and create an alert
        visitQuestion(ORDERS_QUESTION_ID);
        cy.icon("bell").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("The wide world of alerts");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("There are a few different kinds of alerts you can get");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("When a raw data question returns any results");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("When a line or bar crosses a goal line");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("When a progress bar reaches its goal");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Set up an alert").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Done").click();

        cy.wait("@savedAlert");

        // Open the second alert screen
        visitQuestion(ORDERS_COUNT_QUESTION_ID);
        cy.wait("@questionLoaded");

        cy.icon("bell").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Let's set up your alert");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("The wide world of alerts").should("not.exist");
      });
    });
  });
});
