export function enterCustomColumnDetails({ formula, name } = {}) {
  cy.get("[contenteditable='true']")
    .as("formula")
    .type(formula);

  cy.findByPlaceholderText("Something nice and descriptive").type(name);
}
