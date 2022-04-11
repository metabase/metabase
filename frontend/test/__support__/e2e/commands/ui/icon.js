Cypress.Commands.add("icon", icon_name => {
  cy.get(`.Icon-${icon_name}`);
});
