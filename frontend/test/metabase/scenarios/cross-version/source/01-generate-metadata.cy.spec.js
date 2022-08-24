import { withSampleDatabase } from "__support__/e2e/helpers";

it("should generate metadata", () => {
  cy.signInAsAdmin();

  withSampleDatabase(SAMPLE_DATABASE => {
    cy.writeFile(
      "frontend/test/__support__/e2e/cypress_sample_database.json",
      SAMPLE_DATABASE,
    );
  });
});
