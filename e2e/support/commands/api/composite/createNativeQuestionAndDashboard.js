Cypress.Commands.add(
  "createNativeQuestionAndDashboard",
  ({ questionDetails, dashboardDetails } = {}) => {
    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: questionId } }) => {
        cy.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
              cardId: questionId,
              // Add sane defaults for the dashboard card size and position
              row: 0,
              col: 0,
              size_x: 8,
              size_y: 6,
            });
          },
        );
      },
    );
  },
);
