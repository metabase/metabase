Cypress.Commands.add(
  "createDashboard",
  ({
    name = "Test Dashboard",
    enable_embedding,
    embedding_params,
    auto_apply_filters,
    ...dashboardDetails
  } = {}) => {
    cy.log(`Create a dashboard: ${name}`);

    // For all the possible keys, refer to `src/metabase/api/dashboard.clj`
    cy.request("POST", "/api/dashboard", { name, ...dashboardDetails }).then(
      ({ body }) => {
        if (enable_embedding != null || auto_apply_filters != null) {
          cy.request("PUT", `/api/dashboard/${body.id}`, {
            enable_embedding,
            embedding_params,
            auto_apply_filters,
          });
        }
      },
    );
  },
);
