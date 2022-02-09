import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > settings > SSO > Google", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/admin/settings/authentication/google");
  });

  it("Google sign-in client ID should save on subsequent tries (metabase#15974)", () => {
    cy.findByLabelText("Client ID").type(
      "fake-client-id.apps.googleusercontent.com",
    );
    saveSettings();

    // This string lingers for far too long in the UI, so we have to wait for it to disappear before we assert on that same button again.
    // Otherwise, the test fails. That's why we added a custom timeout of 6s.
    cy.findByText("Success", { timeout: 6000 }).should("not.exist");

    cy.findByDisplayValue("fake-client-id.apps.googleusercontent.com").type(
      "fake-client-id2.apps.googleusercontent.com",
    );
    saveSettings();
  });

  it(
    "Google sign-in client ID form should show an error message if it does not end with the correct suffix (metabase#15975)",
  ),
    () => {
      cy.findByLabelText("Client ID").type("fake-client-id");
      saveSettings();

      cy.findByText("Invalid Google Sign-In Client ID");
    };
});

function saveSettings() {
  cy.button("Save changes").click();
  cy.findByText("Success");
}
