import { openOrdersTable, restore } from "e2e/support/helpers";

describe("issue 9339", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not paste non-numeric values into single-value numeric filters (metabase#9339)", () => {
    openOrdersTable();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Equal to").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Greater than").click();

    paste(cy.findByPlaceholderText("Enter a number"), "9339,1234");
    cy.findByDisplayValue("9339").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1,234").should("not.exist");
    cy.button("Add filter").should("be.enabled");
  });
});

const paste = (selection, text) => {
  selection.trigger("paste", { clipboardData: { getData: () => text } });
};
