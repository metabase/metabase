import {
  restore,
  openProductsTable,
  popover,
  tableHeaderClick,
} from "e2e/support/helpers";

describe("issue 16621", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#16621)", () => {
    tableHeaderClick("Category");
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search the list").type("Gadget");
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Category is Gadget").click();
    });
    popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Update filter").click();
    });
    cy.findByTestId("qb-filters-panel")
      .findByText("Category is 2 selections")
      .should("be.visible");
  });
});
