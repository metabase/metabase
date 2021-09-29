Cypress.Commands.add("button", button_name => {
  cy.findByRole("button", { name: button_name });
});
