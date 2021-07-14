import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > settings > SSO > Google", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/admin/settings/authentication/google");
  });

  it("Google sign-in client ID should save on subsequent tries (metabase#15974)", () => {
    cy.findByLabelText("Client ID").type("123");
    saveSettings();

    // This string lingers for far too long in the UI, so we have to wait for it to disappear before we assert on that same button again.
    // Otherwise, the test fails. That's why we added a custom timeout of 6s.
    cy.findByText("Success", { timeout: 6000 }).should("not.exist");

    cy.findByDisplayValue("123").type("456");
    saveSettings();
  });
});

function saveSettings() {
  cy.button("Save changes").click();
  cy.findByText("Success");
}
