import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > settings > SSO > LDAP", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/admin/settings/authentication/ldap");
  });

  it("should be possible to save correct settings", () => {
    cy.intercept("PUT", "/api/**").as("update");

    findToggleByLabel("LDAP authentication").click();
    findInputByLabel("LDAP host").type("example.com");
    findInputByLabel("LDAP port").type("390");
    findInputByLabel("User search base").type("example");

    findButtonByText("Save changes").click();
    cy.wait("@update");
    cy.findByText(/An error occurred while attempting to connect/);
  });

  it("shouldn't be possible to save non-numeric port (#13313)", () => {
    findToggleByLabel("LDAP authentication").click();
    findInputByLabel("LDAP host").type("example.com");
    findInputByLabel("LDAP port").type("21.3");
    findInputByLabel("User search base").type("example");

    cy.findByText("That's not a valid port number");
    findButtonByText("Save changes").should("be.disabled");
  });

  it("shouldn't be possible to change settings when disabled", () => {
    findInputByLabel("LDAP host").should("be.disabled");
    findInputByLabel("LDAP port").should("be.disabled");
    findInputByLabel("User search base").should("be.disabled");
    findButtonByText("Save changes").should("be.disabled");
  });
});

function findByLabel(text, selector) {
  return cy
    .contains(text, { matchCase: false })
    .parent()
    .parent()
    .find(selector);
}

function findToggleByLabel(text) {
  return findByLabel(text, "a");
}

function findInputByLabel(text) {
  return findByLabel(text, "input");
}

function findButtonByText(text) {
  return cy.findByRole("button", { name: text });
}
