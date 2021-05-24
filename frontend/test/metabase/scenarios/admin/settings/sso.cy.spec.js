import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > settings > SSO", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it.skip("Google sign-in client ID should save on subsequent tries (metabase#15974)", () => {
    cy.visit("/admin/settings/authentication/google");
    cy.findByPlaceholderText("Your Google client ID").type("123");
    saveSettings();

    cy.findByDisplayValue("123").type("456");
    saveSettings();
  });

  describe("LDAP", () => {
    beforeEach(() => {
      cy.visit("/admin/settings/authentication/ldap");
    });

    // Space after "123 " is crucial for #13313
    const INVALID_PORTS = ["21.3", "asd", "123 "];

    INVALID_PORTS.forEach(port => {
      it("shouldn't be possible to save non-numeric port (#13313)", () => {
        // The real endpoint is `/api/ldap/settings` but I had to use this ambiguous one for this repro because of #16173
        // Although the endpoint was fixed, we want to always be able to test these issues separately and independently of each other.
        cy.intercept("PUT", "/api/**").as("update");

        cy.findByPlaceholderText("ldap.yourdomain.org").type("foobar");
        cy.findByPlaceholderText("389").type(port);
        cy.button("Save changes").click();
        cy.wait("@update").then(interception => {
          console.log(interception);
          expect(interception.response.statusCode).to.eq(500);
          expect(interception.response.body.cause).to.include(port);
        });
      });
    });
  });
});

function saveSettings() {
  cy.button("Save Changes").click();
  cy.findByText("Saved");
}
