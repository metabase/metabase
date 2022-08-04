describe("smoke test the upgrade to version 43.4", () => {
  it("should already be set up", () => {
    cy.visit("/");
    cy.findByText("Sign in to Metabase");
  });
});
