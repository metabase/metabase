Cypress.Commands.add("button", (button_name, timeout) => {
  cy.findByRole("button", { name: button_name, timeout: timeout });
});
