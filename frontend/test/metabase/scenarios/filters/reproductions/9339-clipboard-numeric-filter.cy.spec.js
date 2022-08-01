import { openOrdersTable, restore } from "__support__/e2e/helpers";

describe("issue 9339", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not paste non-numeric values into single-value numeric filters (metabase#9339)", () => {
    openOrdersTable();

    cy.findByText("Total").click();
    cy.findByText("Filter by this column").click();
    cy.findByText("Equal to").click();
    cy.findByText("Greater than").click();

    paste(cy.findByPlaceholderText("Enter a number"), "9339,1234");
    cy.findByDisplayValue("9339").should("be.visible");
    cy.findByText("1,234").should("not.exist");
    cy.button("Add filter").should("be.enabled");
  });
});

const paste = (selection, text) => {
  selection.trigger("paste", { clipboardData: { getData: () => text } });
};
