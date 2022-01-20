export function enterCustomColumnDetails({ formula, name } = {}) {
  cy.get(".ace_text-input")
    .first()
    .as("formula")
    .should("exist")
    .focus()
    .type(formula);

  if (name) {
    cy.findByPlaceholderText("Something nice and descriptive").type(name);
  }
}
