import type { Dashboard } from "metabase-types/api";

import { createDashboard, type DashboardDetails } from "./createDashboard";

export function createDashboardWithTabs({
  dashcards = [],
  tabs,
  ...dashboardDetails
}: DashboardDetails): Cypress.Chainable<Dashboard> {
  // @ts-expect-error - Cypress typings don't account for what happens in then() here
  return createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    cy.request<Dashboard>("PUT", `/api/dashboard/${dashboard.id}`, {
      ...dashboard,
      dashcards,
      tabs,
    }).then(({ body: dashboard }) => cy.wrap(dashboard));
  });
}
