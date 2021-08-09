Cypress.Commands.add(
  "createDashboard",
  (name, { collection_position = null, collection_id = null } = {}) => {
    cy.log(`Create a dashboard: ${name}`);
    cy.request("POST", "/api/dashboard", {
      name,
      collection_position,
      collection_id,
    });
  },
);
