import { restore, setupLocalHostEmail } from "__support__/e2e/cypress";

describe("scenarios > alert", () => {
  describe("with nothing set", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should prompt you to add email/slack credentials", () => {
      cy.visit("/question/1");
      cy.icon("bell").click();
      cy.findByText(
        "To send alerts, you'll need to set up email or Slack integration.",
      );
    });

    it("should say to non-admins that admin must add email credentials", () => {
      cy.signInAsNormalUser();
      cy.visit("/question/1");
      cy.icon("bell").click();
      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      );
    });
  });

  // [quarantine]: cannot run tests that rely on email setup in CI (yet)
  describe.skip("educational screen", () => {
    before(() => {
      // NOTE: Must run `python -m smtpd -n -c DebuggingServer localhost:1025` before these tests
      cy.signInAsAdmin();
      cy.visit("/admin/settings/email");
      setupLocalHostEmail();
      cy.server();
    });

    it("should show for the first alert, but not the second", () => {
      // Create first alert
      cy.visit("/question/1");
      cy.icon("bell").click();

      cy.findByText("The wide world of alerts");
      cy.contains("When a raw data question returns any results");

      cy.findByText("Set up an alert").click();
      cy.findByText("Done").click();

      // Create second alert
      cy.visit("/question/1");
      cy.icon("bell").click();

      cy.findByText("The wide world of alerts").should("not.exist");
    });
  });
});
