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
    cy.findByText("Success");
    cy.reload();
    cy.findByDisplayValue("fake-client-id.apps.googleusercontent.com").type(
      "fake-client-id2.apps.googleusercontent.com",
    );
    saveSettings();
    cy.findByText("Success");
  });

  it.skip("Remove Google Sing-In Setup (metabase#20442)", () => {
    cy.findByLabelText("Client ID").type("example.apps.googleusercontent.com");
    cy.findByLabelText("Domain").type("example.test");
    saveSettings();
    cy.findByText("Success");
    cy.reload();
    cy.findByLabelText("Client ID").clear();
    cy.findByLabelText("Domain").clear();
    saveSettings();
    cy.findByText("Success");
  });

  it.skip("Google sign-in client ID form should show an error message if it does not end with the correct suffix (metabase#15975)", () => {
    cy.findByLabelText("Client ID").type("fake-client-id");
    saveSettings();
    cy.findByText("Invalid Google Sign-In Client ID");
  });
});

function saveSettings() {
  cy.button("Save changes").click();
  cy.findByText("Success");
}
