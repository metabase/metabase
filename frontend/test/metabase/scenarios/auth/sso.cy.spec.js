import { restore, signOut, signInAsAdmin } from "__support__/cypress";

describe("scenarios > auth > signin > SSO", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
    // Set fake Google client ID
    cy.request("PUT", "/api/setting/google-auth-client-id", {
      value: "123",
    });
    signOut();
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
