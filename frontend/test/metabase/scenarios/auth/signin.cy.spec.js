import { restore, signOut, USERS } from "__support__/cypress";

describe("scenarios > auth > signin", () => {
  before(restore);
  beforeEach(signOut);

  it("should redirect to  /auth/login", () => {
    cy.visit("/");
    cy.url().should("contain", "auth/login");
  });

  it("should display an error for incorrect passwords", () => {
    cy.visit("/");
    cy.findByLabelText("Email address").type(USERS.admin.username);
    cy.findByLabelText("Password").type("INVALID" + USERS.admin.password);
    cy.findByText("Sign in").click();
    cy.contains("did not match stored password");
  });

  it("should display same error for unknown users (to avoid leaking the existence of accounts)", () => {
    cy.visit("/");
    cy.findByLabelText("Email address").type("INVALID" + USERS.admin.username);
    cy.findByLabelText("Password").type(USERS.admin.password);
    cy.findByText("Sign in").click();
    cy.contains("did not match stored password");
  });

  it("should greet users after successful login", () => {
    cy.visit("/auth/login");
    cy.findByLabelText("Email address").type(USERS.admin.username);
    cy.findByLabelText("Password").type(USERS.admin.password);
    cy.findByText("Sign in").click();
    cy.contains(/[a-z ]+, Bob/i);
  });
});
