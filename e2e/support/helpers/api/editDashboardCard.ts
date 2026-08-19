import type {
  Dashboard,
  DashboardCard,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

import { updateDashboard } from "./updateDashboard";

export const editDashboardCard = (
  dashboardCard: DashboardCard,
  updatedProperties: Partial<UpdateDashboardCardRequest>,
): Cypress.Chainable<Cypress.Response<Dashboard>> => {
  const { id, dashboard_id } = dashboardCard;

  cy.log(`Edit dashboard card ${id}`);
  return updateDashboard({
    id: dashboard_id,
    dashcards: [
      {
        ...dashboardCard,
        ...updatedProperties,
      },
    ],
  });
};
