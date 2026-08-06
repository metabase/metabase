import type {
  Dashboard,
  DashboardCard,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

export const editDashboardCard = (
  dashboardCard: DashboardCard,
  updatedProperties: Partial<UpdateDashboardCardRequest>,
): Cypress.Chainable<Cypress.Response<Dashboard>> => {
  const { id, dashboard_id } = dashboardCard;
  const currentCard: Partial<UpdateDashboardCardRequest> = dashboardCard;
  const dashcard: Partial<UpdateDashboardCardRequest> = {
    ...currentCard,
    ...updatedProperties,
  };

  cy.log(`Edit dashboard card ${id}`);
  return cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
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
      },
    ],
  });
};
