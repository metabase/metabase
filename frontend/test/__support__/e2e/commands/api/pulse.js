Cypress.Commands.add(
  "createPulse",
  ({ name = "Pulse", cards = [], channels = [], dashboard_id }) => {
    cy.log("Create a pulse");

    return cy.request("POST", "/api/pulse", {
      name,
      cards,
      channels,
      dashboard_id,
    });
  },
);
