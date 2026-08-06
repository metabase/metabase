import type { Dashboard, DashboardTab } from "metabase-types/api";

import { type DashboardDetails, createDashboard } from "./createDashboard";

export interface DashboardWithTabsDetails extends DashboardDetails {
  tabs?: Pick<DashboardTab, "id" | "name">[];
}

export function createDashboardWithTabs({
  dashcards = [],
  tabs,
  ...dashboardDetails
}: DashboardWithTabsDetails): Cypress.Chainable<Dashboard> {
  // @ts-expect-error - Cypress typings don't account for what happens in then() here
  return createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    cy.request<Dashboard>("PUT", `/api/dashboard/${dashboard.id}`, {
      dashcards,
      tabs,
    }).then(({ body: dashboard }) => cy.wrap(dashboard));
  });
}
