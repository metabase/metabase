Cypress.Commands.add("findByTextEnsureVisible", text => {
  cy.findByText(text).should("be.visible");
});
