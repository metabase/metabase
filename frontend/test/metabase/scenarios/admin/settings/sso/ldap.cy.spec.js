import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > settings > SSO > LDAP", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/admin/settings/authentication/ldap");
  });

  it("shouldn't be possible to save non-numeric port (#13313)", () => {
    findToggleByLabel("LDAP authentication").click();

    findInputByLabel("LDAP host").type("example.com");
    findInputByLabel("LDAP port").type("21.3");
    findInputByLabel("User search base").type("example");

    cy.findByText("That's not a valid port number").should("exist");
    cy.findByRole("button", { name: "Save changes" }).should("be.disabled");
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
