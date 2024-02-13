import { restore, openProductsTable, popover } from "e2e/support/helpers";

describe("issue 24664", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#24664)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    cy.findByTestId("qb-filters-panel").findByText("Category is Gizmo").click();
    popover().within(() => {
      cy.findByText("Widget").click();
      cy.button("Update filter").click();
    });

    // First filter is still there
    cy.findByTestId("qb-filters-panel").findByText("Category is Doohickey");
  });
});
