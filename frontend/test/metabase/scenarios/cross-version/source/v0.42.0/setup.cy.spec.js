describe("setup on version 42.4", () => {
  it("should say hi", () => {
    cy.visit("/");
    cy.findByText("Welcome to Metabase");
  });
});
