import { withSampleDatabase } from "e2e/support/helpers";

it("should generate metadata", () => {
  cy.signInAsAdmin();

  withSampleDatabase(SAMPLE_DATABASE => {
    cy.writeFile("e2e/support/cypress_sample_database.json", SAMPLE_DATABASE);
  });
});
