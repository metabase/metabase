import type {
  Dashboard,
  DashboardId,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

export const DEFAULT_CARD = {
  id: -1,
  row: 0,
  col: 0,
  size_x: 11,
  size_y: 8,
  visualization_settings: {},
  parameter_mappings: [],
};

/**
 * Replaces all the cards on a dashboard with the array given in the `cards` parameter.
 * Can be used to remove cards (exclude from array), or add/update them.
 */
export function updateDashboardCards({
  dashboard_id,
  cards,
}: {
  dashboard_id: DashboardId;
  cards: Partial<UpdateDashboardCardRequest>[];
}): Cypress.Chainable<Cypress.Response<Dashboard>> {
  let id = -1;
  return cy.request<Dashboard>("PUT", `/api/dashboard/${dashboard_id}`, {
    dashcards: cards.map((card) => {
      const dashcard: Partial<UpdateDashboardCardRequest> = {
        ...DEFAULT_CARD,
        id: id--,
        ...card,
      };

      return {
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
      };
    }),
  });
}
