import { restore, openProductsTable } from "__support__/e2e/helpers";

describe("issue 16661", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#16621)", () => {
    cy.findByText("Category").click();
    cy.findByText("Filter by this column").click();
    cy.findByPlaceholderText("Search the list").type("Doo{enter}");
    cy.findByTestId("Doo-filter-value").click();
    cy.button("Add filter").click();
    cy.findByText("Category is Doo").click();
    cy.findByTestId("Doohickey-filter-value").click();
    cy.button("Update filter").click();
    cy.findByText("Category is 2 selections");
  });
});
