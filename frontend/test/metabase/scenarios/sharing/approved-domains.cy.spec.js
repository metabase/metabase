import {
  describeWithToken,
  restore,
  setupSMTP,
  sidebar,
} from "__support__/e2e/cypress";

const allowedDomain = "metabase.test";
const deniedDomain = "metabase.example";
const deniedEmail = `mailer@${deniedDomain}`;
const subscriptionError = `You're only allowed to email subscriptions to addresses ending in ${allowedDomain}`;
const alertError = `You're only allowed to email alerts to addresses ending in ${allowedDomain}`;

describeWithToken("scenarios > alert (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();
    setAllowedEmailDomains(allowedDomain);
  });

  it("should validate approved email domains for a question alert", () => {
    cy.visit("/question/1");

    cy.icon("bell").click();
    cy.findByText("Set up an alert").click();

    addEmailRecipient(deniedEmail);

    cy.findByText("Done").should("be.disabled");
    cy.findByText(alertError);
  });

  it("should validate approved email domains for a dashboard subscription (metabase#17977)", () => {
    cy.visit("/dashboard/1");

    cy.icon("share").click();
    cy.findByText("Dashboard subscriptions").click();
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${deniedEmail}`)
      .blur();

    sidebar().within(() => {
      // Reproduces metabase#17977
      cy.findByText("Send email now").should("be.disabled");
      cy.findByText("Done").should("be.disabled");
      cy.findByText(subscriptionError);
    });
  });
});

function addEmailRecipient(email) {
  cy.findByText("Email alerts to:")
    .parent()
    .find("input")
    .click()
    .type(`${email}`)
    .blur();
}

function setAllowedEmailDomains(domains) {
  cy.request("PUT", "/api/setting/subscription-allowed-domains", {
    value: domains,
  });
}
