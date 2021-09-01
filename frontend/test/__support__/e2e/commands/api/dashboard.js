Cypress.Commands.add(
  "createDashboard",
  (name, { collection_position = null } = {}) => {
    cy.log(`Create a dashboard: ${name}`);
    cy.request("POST", "/api/dashboard", {
      name,
      collection_position,
    });
  },
);
