import { restore, openProductsTable } from "e2e/support/helpers";

describe("issue 24664", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#24664)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    cy.findByTestId("Doohickey-filter-value").click();
    cy.button("Add filter").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    cy.findByTestId("Gizmo-filter-value").click();
    cy.button("Add filter").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is Gizmo").click();
    cy.findByTestId("Widget-filter-value").click();
    cy.button("Update filter").click();

    // First filter is still there
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is Doohickey");
  });
});
