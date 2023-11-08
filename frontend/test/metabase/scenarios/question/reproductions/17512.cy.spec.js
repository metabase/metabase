import { restore, openOrdersTable, popover } from "__support__/e2e/cypress";

describe.skip("issue 17512", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("custom expression should work with `case` in nested queries (metabase#17512)", () => {
    openOrdersTable({ mode: "notebook" });

    addSummarizeCustomExpression(
      "Distinct(case([Discount] > 0, [Subtotal], [Total]))",
      "CE",
    );

    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();

    addCustomColumn("1 + 1", "CC");

    cy.button("Visualize").click();

    cy.wait("@dataset").then(({ response }) => {
      expect(response.body.error).not.to.exist;
    });

    cy.findByText("CE");
    cy.findByText("CC");
  });
});

function addSummarizeCustomExpression(formula, name) {
  cy.findByText("Summarize").click();
  popover()
    .contains("Custom Expression")
    .click();

  popover().within(() => {
    cy.get("[contenteditable='true']")
      .type(formula)
      .blur();
    cy.findByPlaceholderText("Name (required)").type(name);
    cy.button("Done").click();
  });
}

function addCustomColumn(formula, name) {
  cy.findByText("Custom column").click();
  popover().within(() => {
    cy.get("[contenteditable='true']")
      .type(formula)
      .blur();
    cy.findByPlaceholderText("Something nice and descriptive").type(name);
    cy.button("Done").click();
  });
}
