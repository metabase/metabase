import { restore, openProductsTable } from "__support__/e2e/cypress";

describe("scenarios > question > custom column > help text", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
  });

  it("should appear while inside a function", () => {
    cy.get("[contenteditable='true']").type("Lower(");
    cy.findByText("lower(text)");
  });

  it("should appear after a field reference", () => {
    cy.get("[contenteditable='true']").type("Lower([Category]");
    cy.findByText("lower(text)");
  });

  it("should not appear while outside a function", () => {
    cy.get("[contenteditable='true']").type("Lower([Category])");
    cy.findByText("lower(text)").should("not.exist");
  });
});
