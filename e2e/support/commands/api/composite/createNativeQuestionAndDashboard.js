Cypress.Commands.add(
  "createNativeQuestionAndDashboard",
  ({ questionDetails, dashboardDetails } = {}) => {
    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: questionId } }) => {
        cy.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
              cards: [
                {
                  id: -1,
                  card_id: questionId,
                  // Add sane defaults for the dashboard card size and position
                  row: 0,
                  col: 0,
                  size_x: 11,
                  size_y: 6,
                },
              ],
            }).then(response => ({
              ...response,
              body: response.body.cards[0],
            }));
          },
        );
      },
    );
  },
);
