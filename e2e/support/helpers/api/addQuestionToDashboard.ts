import type {
  CardId,
  Dashboard,
  DashboardCard,
  DashboardId,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

export const addQuestionToDashboard = ({
  dashboardId,
  cardId,
}: {
  dashboardId: DashboardId;
  cardId: CardId;
}): Cypress.Chainable<Cypress.Response<DashboardCard>> =>
  cy
    .request<Dashboard>(`/api/dashboard/${dashboardId}`)
    .then(({ body: { dashcards } }) =>
      cy
        .request("PUT", `/api/dashboard/${dashboardId}`, {
          dashcards: [
            ...dashcards.map((currentCard) => {
              const dashcard: Partial<UpdateDashboardCardRequest> = currentCard;

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
            {
              id: -1,
              card_id: cardId,
              // Add sane defaults for the dashboard card size and position
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 8,
            },
          ],
        })
        .then((response) => ({
          ...response,
          body: response.body.dashcards.at(-1),
        })),
    );
