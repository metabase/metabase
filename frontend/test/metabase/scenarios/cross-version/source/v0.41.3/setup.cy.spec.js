describe("setup on version 42.0", () => {
  it("should set up metabase", () => {
    cy.visit("/");
    cy.findByText("Welcome to Metabase");
    cy.findByText("Let's get started").click();
    cy.button("Next").click();

    cy.findByLabelText("First name").type("admin");
    cy.findByLabelText("Last name").type("user");
    cy.findByLabelText("Email").type("admin@metabase.test");
    cy.findByLabelText("Company or team name").type("Metabase");
    cy.findByLabelText("Create a password").type("12341234");
    cy.findByLabelText("Confirm your password").type("12341234");
    cy.button("Next").click();

    cy.findByText("I'll add my data later").click();

    // collection defaults to on and describes data collection
    cy.findByText("All collection is completely anonymous.");
    // turn collection off, which hides data collection description
    cy.findByLabelText(
      "Allow Metabase to anonymously collect usage events",
    ).click();
    cy.findByText("All collection is completely anonymous.").should(
      "not.exist",
    );
    cy.findByText("Finish").click();
    cy.findByText("Take me to Metabase").click();
  });
});
