import { restore, openProductsTable } from "e2e/support/helpers";

describe("issue 16661", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#16621)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    cy.findByPlaceholderText("Search the list").type("Doo{enter}");
    cy.findByTestId("Doo-filter-value").click();
    cy.button("Add filter").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is Doo").click();
    cy.findByTestId("Doohickey-filter-value").click();
    cy.button("Update filter").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is 2 selections");
  });
});
