Cypress.Commands.add("createDashboard", name => {
  cy.log(`Create a dashboard: ${name}`);
  cy.request("POST", "/api/dashboard", { name });
});
