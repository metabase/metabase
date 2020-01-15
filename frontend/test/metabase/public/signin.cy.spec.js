import { restore } from "__support__/cypress";
describe("sign in", () => {
  before(restore);

  it("should display an error for incorrect passwords", () => {
    cy.visit("/");

    // confirm we're redirected to /auth/login when not logged in
    cy.url().should("contain", "auth/login");

    cy.findByLabelText("Email address").type("bobby@metabase.com");
    cy.findByLabelText("Password").type("password"); // invalid password
    cy.findByText("Sign in").click();
    cy.contains("did not match stored password");
  });

  it("should greet users after successful login", () => {
    cy.visit("/auth/login");
    cy.findByLabelText("Email address").type("bob@metabase.com");
    cy.findByLabelText("Password").type("12341234"); // valid
    cy.findByText("Sign in").click();
    cy.contains(/[a-z ]+, Bob/i);
  });
});
