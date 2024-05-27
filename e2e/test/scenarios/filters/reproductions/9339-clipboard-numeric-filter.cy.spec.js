import {
  openOrdersTable,
  restore,
  selectFilterOperator,
  tableHeaderClick,
} from "e2e/support/helpers";

describe("issue 9339", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not paste non-numeric values into single-value numeric filters (metabase#9339)", () => {
    openOrdersTable();

    tableHeaderClick("Total");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    selectFilterOperator("Greater than");
    cy.findByPlaceholderText("Enter a number").type("9339,1234").blur();
    cy.findByDisplayValue("9339").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1,234").should("not.exist");
    cy.button("Add filter").should("be.enabled");
  });
});
