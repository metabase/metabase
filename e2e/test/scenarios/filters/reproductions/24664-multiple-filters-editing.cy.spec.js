import {
  restore,
  openProductsTable,
  popover,
  tableHeaderClick,
} from "e2e/support/helpers";

describe("issue 24664", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#24664)", () => {
    tableHeaderClick("Category");
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    tableHeaderClick("Category");
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
