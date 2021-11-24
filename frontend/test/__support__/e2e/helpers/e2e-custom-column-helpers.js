export function enterCustomColumnDetails({ formula, name } = {}) {
  cy.get(".ace_text-input")
    .first()
    .as("formula")
    .focus()
    .type(formula);

  cy.findByPlaceholderText("Something nice and descriptive").type(name);
}
