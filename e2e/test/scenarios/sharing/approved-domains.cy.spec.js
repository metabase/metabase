import {
  describeEE,
  restore,
  setupSMTP,
  sidebar,
  visitQuestion,
  visitDashboard,
} from "e2e/support/helpers";

const allowedDomain = "metabase.test";
const deniedDomain = "metabase.example";
const deniedEmail = `mailer@${deniedDomain}`;
const subscriptionError = `You're only allowed to email subscriptions to addresses ending in ${allowedDomain}`;
const alertError = `You're only allowed to email alerts to addresses ending in ${allowedDomain}`;

describeEE(
  "scenarios > sharing > approved domains (EE)",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setupSMTP();
      setAllowedDomains();
    });

    it("should validate approved email domains for a question alert", () => {
      visitQuestion(1);

      cy.icon("bell").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Set up an alert").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Email alerts to:")
        .parent()
        .within(() => addEmailRecipient(deniedEmail));

      cy.button("Done").should("be.disabled");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(alertError);
    });

    // Adding test on Quarantine to understand a bit better some H2 Lock issue.
    it.skip("should validate approved email domains for a dashboard subscription (metabase#17977)", () => {
      visitDashboard(1);
      cy.icon("subscription").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Email it").click();

      sidebar().within(() => {
        addEmailRecipient(deniedEmail);

        // Reproduces metabase#17977
        cy.button("Send email now").should("be.disabled");
        cy.button("Done").should("be.disabled");
        cy.findByText(subscriptionError);
      });
    });
  },
);

function addEmailRecipient(email) {
  cy.findByRole("textbox").click().type(`${email}`).blur();
}

function setAllowedDomains() {
  cy.request("PUT", "/api/setting/subscription-allowed-domains", {
    value: allowedDomain,
  });
}
