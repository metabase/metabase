Cypress.Commands.add(
  "createDashboard",
  (
    {
      name = "Test Dashboard",
      auto_apply_filters,
      enable_embedding,
      embedding_params,
      dashcards,
      ...dashboardDetails
    } = {},
    { wrapId = false, idAlias = "dashboardId" } = {},
  ) => {
    cy.log(`Create a dashboard: ${name}`);

    // For all the possible keys, refer to `src/metabase/api/dashboard.clj`
    return cy
      .request("POST", "/api/dashboard", { name, ...dashboardDetails })
      .then(({ body }) => {
        if (wrapId) {
          cy.wrap(body.id).as(idAlias);
        }
        if (
          enable_embedding != null ||
          auto_apply_filters != null ||
          Array.isArray(dashcards)
        ) {
          cy.request("PUT", `/api/dashboard/${body.id}`, {
            auto_apply_filters,
            enable_embedding,
            embedding_params,
            dashcards,
          });
        }

        return new Promise(resolve => resolve({ body }));
      });
  },
);

Cypress.Commands.add("archiveDashboard", id => {
  cy.log(`Archiving a dashboard with id: ${id}`);
  return cy.request("PUT", `/api/dashboard/${id}`, {
    archived: true,
  });
});
