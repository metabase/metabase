import { USERS } from "e2e/support/cypress_data";
import {
  describeEE,
  restore,
  mockCurrentUserProperty,
  setTokenFeatures,
} from "e2e/support/helpers";

const { admin } = USERS;

describe("scenarios > auth > signin > SSO", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    // Set fake Google client ID and enable Google auth
    cy.request("PUT", "/api/google/settings", {
      "google-auth-client-id": "fake-client-id.apps.googleusercontent.com",
      "google-auth-enabled": true,
    });
  });

  ["ldap_auth", "google_auth"].forEach(auth => {
    it(`login history tab should be available with ${auth} enabled (metabase#15558)`, () => {
      mockCurrentUserProperty(auth, true);
      cy.visit("/account/profile");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Login History");
    });
  });

  describe("OSS", () => {
    beforeEach(() => {
      cy.signOut();
      cy.visit("/");
    });

    it("should show SSO button", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sign in with email");

      // Google SSO button is piped through an iframe
      cy.get("iframe");
    });

    it("should show login form when directed to sign in with email", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sign in with email").click();
      cy.findByLabelText("Email address");
      cy.findByLabelText("Password");
      cy.button("Sign in").should("be.disabled");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sign in with Google");
    });

    it("should surface login errors with Google sign in enabled (metabase#16122)", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sign in with email").click();
      cy.findByLabelText("Email address").type("foo@bar.test");
      cy.findByLabelText("Password").type("123");
      cy.button("Sign in").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Password: did not match stored password");
    });

    it("should pass `redirect` search params from Google button screen to email/password screen (metabase#16216)", () => {
      const loginProtectedURL = "/admin/permissions/data";

      cy.visit(loginProtectedURL);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sign in with email").click();
      fillInAuthForm();

      cy.url().should("include", loginProtectedURL);
    });
  });

  describeEE("EE", () => {
    beforeEach(() => {
      setTokenFeatures("all");
      // Disable password log-in
      cy.request("PUT", "api/setting/enable-password-login", {
        value: false,
      });
      cy.signOut();
    });

    it("should show the SSO button without an option to use password", () => {
      cy.visit("/");
      // Google SSO button is piped through an iframe
      cy.get("iframe");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sign in with email").should("not.exist");
    });
  });
});

const fillInAuthForm = () => {
  cy.findByLabelText("Email address").type(admin.email);
  cy.findByLabelText("Password").type(admin.password);
  cy.findByText("Sign in").click();
};
