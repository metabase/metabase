import { restore } from "__support__/e2e/cypress";

// Space after "123 " is crucial for #13313
const INVALID_PORTS = ["21.3", "asd", "123 "];

describe("scenarios > admin > settings > SSO > LDAP", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/admin/settings/authentication/ldap");
  });

  /**
   * IMPORTANT:
   * These repros currently rely on the broken behavior. It is possible to save settings without authentication turned on.
   * See: https://github.com/metabase/metabase/issues/16225
   * It is possible related repros will have to be rewritten/adjusted once #16255 gets fixed!
   */

  INVALID_PORTS.forEach(port => {
    it("shouldn't be possible to save non-numeric port (#13313)", () => {
      // The real endpoint is `/api/ldap/settings` but I had to use this ambiguous one for this repro because of #16173
      // Although the endpoint was fixed, we want to always be able to test these issues separately and independently of each other.
      cy.intercept("PUT", "/api/**").as("update");

      cy.findByPlaceholderText("ldap.yourdomain.org").type("foobar");
      cy.findByPlaceholderText("389").type(port);
      cy.button("Save changes").click();
      cy.wait("@update").then(interception => {
        expect(interception.response.statusCode).to.eq(500);
        expect(interception.response.body.cause).to.include(port);
      });
    });
  });

  it("should use the correct endpoint (metabase#16173)", () => {
    cy.intercept("PUT", "/api/ldap/settings").as("ldapUpdate");
    cy.findByPlaceholderText("ldap.yourdomain.org").type("foobar");
    cy.findByPlaceholderText("389").type("888");
    cy.findByText(/Username or DN/i)
      .closest("li")
      .find("input")
      .type("John");
    cy.findByText("The password to bind with for the lookup user.")
      .closest("li")
      .find("input")
      .type("Smith");
    cy.button("Save changes").click();
    cy.wait("@ldapUpdate").then(interception => {
      expect(interception.response.statusCode).to.eq(200);
    });
    cy.button("Changes saved!");
  });

  it.skip("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
    cy.findByPlaceholderText("ldap.yourdomain.org").type("foobar");
    cy.findByPlaceholderText("389").type("baz");
    cy.button("Save changes").click();

    cy.findByText('For input string: "baz"'); // The error message
    cy.findByDisplayValue("foobar");
  });
});
