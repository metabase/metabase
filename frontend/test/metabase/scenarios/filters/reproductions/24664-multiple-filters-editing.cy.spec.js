import { restore, openProductsTable } from "__support__/e2e/helpers";

describe("issue 24664", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#24664)", () => {
    cy.findByText("Category").click();
    cy.findByText("Filter by this column").click();
    cy.findByTestId("Doohickey-filter-value").click();
    cy.button("Add filter").click();

    cy.findByText("Category").click();
    cy.findByText("Filter by this column").click();
    cy.findByTestId("Gizmo-filter-value").click();
    cy.button("Add filter").click();

    cy.findByText("Category is Gizmo").click();
    cy.findByTestId("Widget-filter-value").click();
    cy.button("Update filter").click();

    // First filter is still there
    cy.findByText("Category is Doohickey");
  });
});
