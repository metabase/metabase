import { describeWithToken, restore } from "__support__/e2e/cypress";

describe("scenarios > auth > signin > SSO", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    // Set fake Google client ID
    cy.request("PUT", "/api/setting/google-auth-client-id", {
      value: "123",
    });
  });

  describe("OSS", () => {
    beforeEach(() => {
      cy.signOut();
    });

    it("should show SSO button", () => {
      cy.visit("/");
      cy.findByText("Sign in with Google");
      cy.findByText("Sign in with email");
    });

    it("should show login form when directed to sign in with email", () => {
      cy.visit("/");
      cy.findByText("Sign in with email").click();
      cy.findByLabelText("Email address");
      cy.findByLabelText("Password");
      cy.findByText("Sign in")
        .closest("button")
        .should("be.disabled");
      cy.findByText("Sign in with Google").should("not.exist");
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
