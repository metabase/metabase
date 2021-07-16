Cypress.Commands.add(
  "addFilterToDashboard",
  ({ filter, dashboard_id } = {}) => {
    cy.log(`Add filter to the dashboard`);

    cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
      parameters: [filter],
    });
  },
);
