import type { CardId, DashboardCard, DashboardId } from "metabase-types/api";

export const addQuestionToDashboard = ({
  dashboardId,
  cardId,
}: {
  dashboardId: DashboardId;
  cardId: CardId;
}): Cypress.Chainable<Cypress.Response<DashboardCard>> =>
  cy.request(`/api/dashboard/${dashboardId}`).then(({ body: { dashcards } }) =>
    cy
      .request("PUT", `/api/dashboard/${dashboardId}`, {
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
      })
      .then(response => ({
        ...response,
        body: response.body.dashcards.at(-1),
      })),
  );
