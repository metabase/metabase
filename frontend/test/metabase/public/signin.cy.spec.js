describe("sign in", () => {
  it("should display an error for incorrect passwords", () => {
    cy.visit("/");

    // confirm we're redirected to /auth/login when not logged in
    cy.url().should("contain", "auth/login");

    cy.contains("Email address")
      .next()
      .type("bobby@metabase.com");
    cy.contains("Password")
      .next()
      .type("password"); // invalid password
    cy.get(".Button").click();
    cy.contains("did not match stored password");
  });

  it("should greet users after successful login", () => {
    cy.visit("/auth/login");
    cy.contains("Email address")
      .next()
      .type("bob@metabase.com");
    cy.contains("Password")
      .next()
      .type("12341234");
    cy.get(".Button").click();
    cy.contains(/[a-z ]+, Bob/i);
  });
});
