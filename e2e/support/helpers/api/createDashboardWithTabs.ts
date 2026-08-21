import type { Dashboard } from "metabase-types/api";

import { type DashboardDetails, createDashboard } from "./createDashboard";

export function createDashboardWithTabs({
  dashcards = [],
  ...dashboardDetails
}: DashboardDetails): Cypress.Chainable<Dashboard> {
  return createDashboard({ ...dashboardDetails, dashcards }).then(
    ({ body: dashboard }) => cy.wrap(dashboard),
  );
}
