import {
  describeWithToken,
  modal,
  restore,
  setupSMTP,
  sidebar,
} from "__support__/e2e/cypress";

const allowedDomain = "metabase.test";
const deniedDomain = "metabase.example";
const allowedEmail = `mailer@${allowedDomain}`;
const deniedEmail = `mailer@${deniedDomain}`;
const subscriptionError = `You're only allowed to email subscriptions to addresses ending in ${allowedDomain}`;
const alertError = `You're only allowed to email alerts to addresses ending in ${allowedDomain}`;

describeWithToken("scenarios > sharing > approved domains (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
    setAllowedDomains();
  });

  it("should validate approved email domains for a question alert", () => {
    cy.visit("/question/1");

    cy.icon("bell").click();
    cy.findByText("Set up an alert").click();

    cy.findByText("Email alerts to:")
      .parent()
      .within(() => addEmailRecipient(deniedEmail));

    cy.button("Done").should("be.disabled");
    cy.findByText(alertError);
  });

  it("should validate approved email domains for a question alert in the audit app", () => {
    cy.visit("/question/1");
    cy.icon("bell").click();
    cy.findByText("Set up an alert").click();
    cy.button("Done").click();
    cy.findByText("Your alert is all set up.");

    cy.visit("/admin/audit/subscriptions/alerts");
    cy.findByText("1").click();

    modal().within(() => {
      addEmailRecipient(deniedEmail);

      cy.button("Update").should("be.disabled");
      cy.findByText(alertError);
    });
  });

  it("should validate approved email domains for a dashboard subscription (metabase#17977)", () => {
    cy.visit("/dashboard/1");
    cy.icon("share").click();
    cy.findByText("Dashboard subscriptions").click();
    cy.findByText("Email it").click();

    sidebar().within(() => {
      addEmailRecipient(deniedEmail);

      // Reproduces metabase#17977
      cy.button("Send email now").should("be.disabled");
      cy.button("Done").should("be.disabled");
      cy.findByText(subscriptionError);
    });
  });

  it("should validate approved email domains for a dashboard subscription in the audit app", () => {
    cy.visit("/dashboard/1");
    cy.icon("share").click();
    cy.findByText("Dashboard subscriptions").click();
    cy.findByText("Email it").click();

    sidebar().within(() => {
      addEmailRecipient(allowedEmail);
      cy.button("Done").click();
    });

    cy.visit("/admin/audit/subscriptions/subscriptions");
    cy.findByText("1").click();

    modal().within(() => {
      addEmailRecipient(deniedEmail);

      cy.button("Update").should("be.disabled");
      cy.findByText(subscriptionError);
    });
  });
});

function addEmailRecipient(email) {
  cy.findByRole("textbox")
    .click()
    .type(`${email}`)
    .blur();
}

function setAllowedDomains() {
  cy.request("PUT", "/api/setting/subscription-allowed-domains", {
    value: allowedDomain,
  });
}
