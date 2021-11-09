import { restore, openProductsTable } from "__support__/e2e/cypress";

describe("scenarios > question > custom column > typing suggestion", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
  });

  it("should not suggest arithmetic operators", () => {
    cy.get("[contenteditable='true']").type("[Price] ");
    cy.findByTestId("expression-suggestions-list").should("not.exist");
  });

  it("should correctly accept the chosen field suggestion", () => {
    cy.get("[contenteditable='true']").type(
      "[Rating]{leftarrow}{leftarrow}{leftarrow}",
    );

    // accept the only suggested item, i.e. "[Rating]"
    cy.get("[contenteditable='true']").type("{enter}");

    // if the replacement is correct -> "[Rating]"
    // if the replacement is wrong -> "[Rating] ng"
    cy.get("[contenteditable='true']")
      .contains("[Rating] ng")
      .should("not.exist");
  });

  it("should correctly accept the chosen function suggestion", () => {
    cy.get("[contenteditable='true']").type("LTRIM([Title])");

    // Place the cursor between "is" and "empty"
    cy.get("[contenteditable='true']").type(
      Array(13)
        .fill("{leftarrow}")
        .join(""),
    );

    // accept the first suggested function, i.e. "length"
    cy.get("[contenteditable='true']").type("{enter}");

    cy.get("[contenteditable='true']").contains("length([Title])");
  });

  it("should correctly insert function suggestion with the opening parenthesis", () => {
    cy.get("[contenteditable='true']").type("LOW{enter}");
    cy.get("[contenteditable='true']").contains("lower(");
  });
});
