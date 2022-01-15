Cypress.Commands.add(
  "createAlert",
  ({
    card,
    channels = [],
    alert_condition = "rows",
    alert_first_only = false,
    alert_above_goal = false,
  } = {}) => {
    cy.log("Create an alert");

    return cy.request("POST", "/api/alert", {
      card,
      channels,
      alert_condition,
      alert_first_only,
      alert_above_goal,
    });
  },
);
