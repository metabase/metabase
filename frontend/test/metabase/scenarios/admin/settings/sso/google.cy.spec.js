import { restore } from "__support__/e2e/helpers";

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
    successfullySaveSettings();
    cy.reload();
    cy.findByDisplayValue("fake-client-id.apps.googleusercontent.com")
      .clear()
      .type("fake-client-id2.apps.googleusercontent.com");
    successfullySaveSettings();
  });

  it("Remove Google Sing-In Setup (metabase#20442)", () => {
    cy.request("PUT", "/api/setting", {
      "google-auth-client-id": "example.apps.googleusercontent.com",
      "google-auth-auto-create-accounts-domain": "example.test",
    });
    cy.visit("/admin/settings/authentication/google");
    cy.findByLabelText("Client ID").clear();
    cy.findByLabelText("Domain").clear();
    successfullySaveSettings();
  });

  it("Google sign-in client ID form should show an error message if it does not end with the correct suffix (metabase#15975)", () => {
    cy.findByLabelText("Client ID").type("fake-client-id");
    cy.button("Save changes").click();
    cy.findByText(
      'Invalid Google Sign-In Client ID: must end with ".apps.googleusercontent.com"',
    );
  });
});

function successfullySaveSettings() {
  cy.button("Save changes").click();
  cy.findByText("Success");
}
