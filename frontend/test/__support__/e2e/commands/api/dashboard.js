Cypress.Commands.add(
  "createDashboard",
  ({ name = "Test Dashboard", ...dashboardDetails } = {}) => {
    cy.log(`Create a dashboard: ${name}`);

    // For all the possible keys, refer to `src/metabase/api/dashboard.clj`
    return cy.request("POST", "/api/dashboard", { name, ...dashboardDetails });
  },
);
