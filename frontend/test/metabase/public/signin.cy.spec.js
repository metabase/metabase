import { restore } from "__support__/cypress";
describe("sign in", () => {
  before(restore);

  it("should display an error for incorrect passwords", () => {
    cy.visit("/");

    // confirm we're redirected to /auth/login when not logged in
    cy.url().should("contain", "auth/login");

    cy.get('[name="username"]').type("bobby@metabase.com");
    cy.get('[name="password"]').type("password"); // invalid password
    cy.get(".Button").click();
    cy.contains("did not match stored password");
  });

  it("should greet users after successful login", () => {
    cy.visit("/auth/login");
    cy.get('[name="username"]').type("bob@metabase.com");
    cy.get('[name="password"]').type("12341234");
    cy.get(".Button").click();
    cy.contains(/[a-z ]+, Bob/i);
  });
});
