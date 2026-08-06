import type {
  CardId,
  Dashboard,
  DashboardCard,
  DashboardId,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

import { DEFAULT_CARD } from "./updateDashboardCards";

export function addOrUpdateDashboardCard({
  card_id,
  dashboard_id,
  card,
}: {
  card_id: CardId;
  dashboard_id: DashboardId;
  card: Partial<UpdateDashboardCardRequest>;
}): Cypress.Chainable<Cypress.Response<DashboardCard>> {
  const dashcard: Partial<UpdateDashboardCardRequest> = {
    ...DEFAULT_CARD,
    card_id,
    ...card,
  };

  return cy
    .request<Dashboard>("PUT", `/api/dashboard/${dashboard_id}`, {
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
    })
    .then((response) => ({
      ...response,
      body: response.body.dashcards[0],
    }));
}
