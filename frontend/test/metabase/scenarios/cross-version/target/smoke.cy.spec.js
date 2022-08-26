import { version } from "./cross-version-target-helpers";

describe(`smoke test the migration to the version ${version}`, () => {
  it("should already be set up", () => {
    cy.visit("/");
    cy.findByText("Sign in to Metabase");

    cy.findByLabelText("Email address").type("admin@metabase.test");
    cy.findByLabelText("Password").type("12341234");
    cy.button("Sign in").click();

    cy.findByPlaceholderText("Search…");

    cy.visit("/collection/root");
    cy.findByText("Best Sold Products Rating");
    cy.findByText("Quarterly Revenue");
  });
});
