import {
  describeEE,
  modal,
  restore,
  setupSMTP,
  sidebar,
  visitQuestion,
  visitDashboard,
} from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_data";

const allowedDomain = "metabase.test";
const deniedDomain = "metabase.example";
const allowedEmail = `mailer@${allowedDomain}`;
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

    it("should validate approved email domains for a question alert in the audit app", () => {
      visitQuestion(ORDERS_QUESTION_ID);
      cy.icon("bell").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Set up an alert").click();
      cy.button("Done").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Your alert is all set up.");

      cy.visit("/admin/audit/subscriptions/alerts");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1").click();

      modal().within(() => {
        addEmailRecipient(deniedEmail);

        cy.button("Update").should("be.disabled");
        cy.findByText(alertError);
      });
    });

    it("should validate approved email domains for a dashboard subscription in the audit app", () => {
      visitDashboard(1);
      cy.icon("share").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Dashboard subscriptions").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Email it").click();

      sidebar().within(() => {
        addEmailRecipient(allowedEmail);
        cy.button("Done").click();
      });

      cy.visit("/admin/audit/subscriptions/subscriptions");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1").click();

      modal().within(() => {
        addEmailRecipient(deniedEmail);

        cy.button("Update").should("be.disabled");
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
