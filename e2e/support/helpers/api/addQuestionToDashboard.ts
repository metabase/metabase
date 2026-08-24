import type {
  CardId,
  Dashboard,
  DashboardCard,
  DashboardId,
} from "metabase-types/api";

import { updateDashboard } from "./updateDashboard";

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
      updateDashboard({
        id: dashboardId,
        dashcards: [
          ...dashcards,
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
      }).then((response) => ({
        ...response,
        // PUT returns the dashboard we just wrote, including the dashcard we appended
        body: response.body.dashcards.at(-1) as DashboardCard,
      })),
    );
