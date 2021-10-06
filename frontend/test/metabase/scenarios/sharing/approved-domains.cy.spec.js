import {
  restore,
  setupSMTP,
  describeWithToken,
  sidebar,
} from "__support__/e2e/cypress";

const allowedDomain = "metabase.test";
const deniedDomain = "metabase.example";
const email = "mailer@" + deniedDomain;

const errorMessage = `You cannot create new subscriptions for the domain "${deniedDomain}". Allowed domains are: ${allowedDomain}`;

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

    addEmailRecipient(email);

    cy.button("Done").click();
    cy.findByText(errorMessage);
  });

  it("should validate approved email domains for a dashboard subscription", () => {
    cy.visit("/dashboard/1");

    cy.icon("share").click();
    cy.findByText("Dashboard subscriptions").click();
    cy.findByText("Email it").click();
    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${email}`)
      .blur();

    sidebar().within(() => {
      cy.button("Done").click();
      cy.findByText(errorMessage);
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
