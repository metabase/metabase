import {
  describeWithToken,
  restore,
  mockCurrentUserProperty,
} from "__support__/e2e/cypress";

describe("scenarios > auth > signin > SSO", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    // Set fake Google client ID
    cy.request("PUT", "/api/setting/google-auth-client-id", {
      value: "123",
    });
  });

  ["ldap_auth", "google_auth"].forEach(auth => {
    it.skip(`login history tab should be available with ${auth} enabled (metabase#15558)`, () => {
      mockCurrentUserProperty(auth, true);
      cy.visit("/user/edit_current");
      cy.findByText("Login History");
    });
  });

  describe("OSS", () => {
    beforeEach(() => {
      cy.signOut();
      cy.visit("/");
    });

    it("should show SSO button", () => {
      cy.findByText("Sign in with Google");
      cy.findByText("Sign in with email");
    });

    it("should show login form when directed to sign in with email", () => {
      cy.findByText("Sign in with email").click();
      cy.findByLabelText("Email address");
      cy.findByLabelText("Password");
      cy.button("Sign in").should("be.disabled");
      cy.findByText("Sign in with Google").should("not.exist");
    });

    it.skip("should surface login errors with Google sign in enabled (metabase#16122)", () => {
      cy.findByText("Sign in with email").click();
      cy.findByLabelText("Email address").type("foo@bar.test");
      cy.findByLabelText("Password").type("123");
      cy.button("Sign in").click();
      cy.contains("Password: did not match stored password");
    });
  });

  describeWithToken("EE", () => {
    beforeEach(() => {
      // Disable password log-in
      cy.request("PUT", "api/setting/enable-password-login", {
        value: false,
      });
      cy.signOut();
    });

    it("should show the SSO button without an option to use password", () => {
      cy.visit("/");
      cy.findByText("Sign in with Google");
      cy.findByText("Sign in with email").should("not.exist");
    });
  });
});
