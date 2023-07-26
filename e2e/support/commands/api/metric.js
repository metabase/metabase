Cypress.Commands.add(
  "createMetric",
  ({ name, table_id, definition, description = null }) => {
    cy.log(`Create a metric: ${name}`);
    return cy.request("POST", "/api/metric", {
      name,
      description,
      table_id,
      definition,
    });
  },
);
