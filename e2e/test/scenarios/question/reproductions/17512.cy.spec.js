import {
  restore,
  openOrdersTable,
  popover,
  visualize,
  summarize,
} from "e2e/support/helpers";

describe("issue 17512", () => {
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

    visualize(({ body }) => {
      expect(body.error).to.not.exist;
    });

    cy.findByText("CE");
    cy.findByText("CC");
  });
});

function addSummarizeCustomExpression(formula, name) {
  summarize({ mode: "notebook" });
  popover().contains("Custom Expression").click();

  popover().within(() => {
    cy.get(".ace_text-input").type(formula).blur();
    cy.findByPlaceholderText("Something nice and descriptive").type(name);
    cy.button("Done").click();
  });
}

function addCustomColumn(formula, name) {
  cy.findByText("Custom column").click();
  popover().within(() => {
    cy.get(".ace_text-input").type(formula).blur();
    cy.findByPlaceholderText("Something nice and descriptive").type(name);
    cy.button("Done").click();
  });
}
