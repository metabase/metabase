export function enterCustomColumnDetails({ formula, name } = {}) {
  cy.get(".ace_text-input")
    .first()
    .as("formula")
    .focus()
    .type(formula, { delay: 50 })
    .blur();

  if (name) {
    cy.findByPlaceholderText("Something nice and descriptive").type(name);
  }
}
