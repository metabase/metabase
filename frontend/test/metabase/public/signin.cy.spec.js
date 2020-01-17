import { restore, signOut, USERS } from "__support__/cypress";
describe("sign in", () => {
  before(restore);
  beforeEach(signOut);

  it("should redirect to  /auth/login", () => {
    cy.visit("/");
    cy.url().should("contain", "auth/login");
  });

  it("should display an error for incorrect passwords", () => {
    cy.visit("/");
    cy.get('[name="username"]').type(USERS.admin.username);
    cy.get('[name="password"]').type("INVALID" + USERS.admin.password);
    cy.get(".Button").click();
    cy.contains("did not match stored password");
  });

  it("should display same error for unknown users", () => {
    cy.visit("/");
    cy.get('[name="username"]').type("INVALID" + USERS.admin.username);
    cy.get('[name="password"]').type(USERS.admin.password);
    cy.get(".Button").click();
    cy.contains("did not match stored password");
  });

  it("should greet users after successful login", () => {
    cy.visit("/");
    cy.get('[name="username"]').type(USERS.admin.username);
    cy.get('[name="password"]').type(USERS.admin.password);
    cy.get(".Button").click();
    cy.contains(/[a-z ]+, Bobby/i);
  });
});
