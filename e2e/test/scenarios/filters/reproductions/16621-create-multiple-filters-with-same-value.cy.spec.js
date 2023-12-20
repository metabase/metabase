import { restore, openProductsTable, popover } from "e2e/support/helpers";

describe("issue 16661", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#16621)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search the list").type("Doo{enter}");
      cy.button("Add filter").click();
    });
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Category is Doo").click();
    });
    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Update filter").click();
    });
    cy.findByTestId("qb-filters-panel")
      .findByText("Category is 2 selections")
      .should("be.visible");
  });
});
