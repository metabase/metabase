import { version } from "./cross-version-target-helpers";

describe(`smoke test the migration to the version ${version}`, () => {
  it("should already be set up", () => {
    cy.visit("/");
    cy.findByText("Sign in to Metabase");
  });
});
