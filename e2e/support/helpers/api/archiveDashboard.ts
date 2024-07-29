import type { Dashboard, DashboardId } from "metabase-types/api";

export const archiveDashboard = (
  id: DashboardId,
): Cypress.Chainable<Cypress.Response<Dashboard>> => {
  cy.log(`Archiving a dashboard with id: ${id}`);

  return cy.request<Dashboard>("PUT", `/api/dashboard/${id}`, {
    archived: true,
  });
};
