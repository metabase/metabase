const { H } = cy;

it("should generate metadata", () => {
  cy.signInAsAdmin();

  H.withSampleDatabase((SAMPLE_DATABASE) => {
    cy.writeFile("e2e/support/cypress_sample_database.json", SAMPLE_DATABASE);
  });
});
