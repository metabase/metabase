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
      dashcards: dashcards.map((dashcard) => ({
        id: dashcard.id,
        card_id: dashcard.card_id,
        action_id: dashcard.action_id,
        dashboard_tab_id: dashcard.dashboard_tab_id,
        row: dashcard.row,
        col: dashcard.col,
        size_x: dashcard.size_x,
        size_y: dashcard.size_y,
        visualization_settings: dashcard.visualization_settings,
        parameter_mappings: dashcard.parameter_mappings,
        inline_parameters: dashcard.inline_parameters,
        series: dashcard.series,
      })),
      tabs: tabs?.map(({ id, name }) => ({ id, name })),
    }).then(({ body: dashboard }) => cy.wrap(dashboard));
  });
}
