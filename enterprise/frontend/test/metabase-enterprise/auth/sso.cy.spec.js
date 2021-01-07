import {
  restore,
  signOut,
  signInAsAdmin,
  describeWithToken,
} from "__support__/cypress";

describeWithToken("scenarios > auth > signin > SSO", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
    // Set fake Google client ID
    cy.request("PUT", "/api/setting/google-auth-client-id", {
      value: "123",
    });
    // Disable password log-in
    cy.request("PUT", "api/setting/enable-password-login", {
      value: false,
    });
    signOut();
  });

  it("should show the SSO button without an option to use password", () => {
    cy.visit("/");
    cy.findByText("Sign in with Google");
    cy.findByText("Sign in with email").should("not.exist");
  });
});
