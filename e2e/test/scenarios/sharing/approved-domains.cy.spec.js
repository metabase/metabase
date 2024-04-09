import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  describeEE,
  restore,
  setupSMTP,
  sidebar,
  visitQuestion,
  visitDashboard,
  setTokenFeatures,
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
      setTokenFeatures("all");
      setupSMTP();
      setAllowedDomains();
    });

    it("should validate approved email domains for a question alert", () => {
      visitQuestion(ORDERS_QUESTION_ID);

      cy.icon("bell").click();
      cy.button("Set up an alert").click();

      cy.findByRole("heading", { name: "Email" })
        .closest("li")
        .within(() => {
          addEmailRecipient(deniedEmail);
          cy.findByText(alertError);
        });
      cy.button("Done").should("be.disabled");
    });

    it("should validate approved email domains for a dashboard subscription (metabase#17977)", () => {
      visitDashboard(ORDERS_DASHBOARD_ID);
      cy.icon("subscription").click();

      cy.findByRole("heading", { name: "Email it" }).click();

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
