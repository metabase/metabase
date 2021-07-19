// TODO: does this really need to be a global helper function?
export function createBasicAlert({ firstAlert, includeNormal } = {}) {
  cy.get(".Icon-bell").click();
  if (firstAlert) {
    cy.findByText("Set up an alert").click();
  }
  cy.findByText("Let's set up your alert");
  if (includeNormal) {
    cy.findByText("Email alerts to:")
      .parent()
      .children()
      .last()
      .click();
    cy.findByText("Robert Tableton").click();
  }
  cy.findByText("Done").click();
  cy.findByText("Let's set up your alert").should("not.exist");
}

export function setupDummySMTP() {
  cy.log("Set up dummy SMTP server");
  cy.request("PUT", "/api/setting", {
    "email-smtp-host": "smtp.foo.test",
    "email-smtp-port": "587",
    "email-smtp-security": "none",
    "email-smtp-username": "nevermind",
    "email-smtp-password": "it-is-secret-NOT",
    "email-from-address": "nonexisting@metabase.test",
  });
}

export function createNativeQuestion(name, query) {
  return cy.request("POST", "/api/card", {
    name,
    dataset_query: {
      type: "native",
      native: { query },
      database: 1,
    },
    display: "table",
    visualization_settings: {},
  });
}

export function setupLocalHostEmail() {
  // Email info
  cy.findByPlaceholderText("smtp.yourservice.com").type("localhost");
  cy.findByPlaceholderText("587").type("1025");
  cy.findByText("None").click();
  // Leaves password and username blank
  cy.findByPlaceholderText("metabase@yourcompany.com").type("test@local.host");

  // *** Unnecessary click (metabase#12692)
  cy.findByPlaceholderText("smtp.yourservice.com").click();

  cy.findByText("Save changes").click();
  cy.findByText("Changes saved!");

  cy.findByText("Send test email").click();
}
