import { restore, openProductsTable } from "__support__/e2e/helpers";

describe.skip("issue 23677", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("`exclude` fitler should work properly with `is empty` and `is not empty` (metabase#23677)", () => {
    openProductsTable();
    cy.findByText("Showing 200 rows");

    cy.findByTextEnsureVisible("Created At").click();
    cy.findByText("Filter by this column").click();
    cy.findByText("Exclude...").click();
    cy.findByText("Is empty").click();
    cy.wait("@dataset");

    // We don't have empty rows in this column so the result should stay the same
    cy.findByText("Showing 200 rows");
    // NOTE: Not sure how are we going to resolve this filter name. Update accordingly.
    cy.findByText("Created At excludes is empty");
  });
});
