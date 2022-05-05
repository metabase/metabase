import { openOrdersTable, restore } from "__support__/e2e/cypress";

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

    paste(cy.findByPlaceholderText("Enter a number"), "12,12");
    cy.button("Add filter").should("be.disabled");

    paste(cy.findByPlaceholderText("Enter a number"), "12.12");
    cy.button("Add filter").should("be.enabled");
  });
});

const paste = (selection, text) => {
  selection.trigger("paste", { clipboardData: { getData: () => text } });
};
