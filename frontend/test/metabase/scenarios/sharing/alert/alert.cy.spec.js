import {
  restore,
  setupSMTP,
  mockSlackConfigured,
  visitQuestion,
} from "__support__/e2e/helpers";

const channels = { slack: mockSlackConfigured, email: setupSMTP };

describe("scenarios > alert", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
  describe("with nothing set", () => {
    it("should prompt you to add email/slack credentials", () => {
      visitQuestion(1);
      cy.icon("bell").click();

      cy.findByText(
        "To send alerts, you'll need to set up email or Slack integration.",
      );
    });

    it("should say to non-admins that admin must add email credentials", () => {
      cy.signInAsNormalUser();

      visitQuestion(1);
      cy.icon("bell").click();

      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      );
    });
  });

  Object.entries(channels).forEach(([channel, setup]) => {
    describe(`with ${channel} set up`, () => {
      beforeEach(setup);

      it("educational screen should show for the first alert, but not for the second", () => {
        cy.intercept("POST", "/api/alert").as("savedAlert");
        cy.intercept("POST", "/api/card/2/query").as("questionLoaded");

        // Open the first alert screen and create an alert
        visitQuestion(1);
        cy.icon("bell").click();

        cy.findByText("The wide world of alerts");
        cy.findByText("There are a few different kinds of alerts you can get");

        cy.contains("When a raw data question returns any results");
        cy.contains("When a line or bar crosses a goal line");
        cy.contains("When a progress bar reaches its goal");

        cy.findByText("Set up an alert").click();
        cy.findByText("Done").click();

        cy.wait("@savedAlert");

        // Open the second alert screen
        visitQuestion(2);
        cy.wait("@questionLoaded");

        cy.icon("bell").click();

        cy.findByText("Let's set up your alert");
        cy.findByText("The wide world of alerts").should("not.exist");
      });
    });
  });
});
