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
});

function saveSettings() {
  cy.button("Save Changes").click();
  cy.findByText("Saved");
}
