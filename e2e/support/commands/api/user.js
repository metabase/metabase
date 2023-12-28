Cypress.Commands.add("getCurrentUser", () => {
  return cy.request("GET", "/api/user/current");
});
