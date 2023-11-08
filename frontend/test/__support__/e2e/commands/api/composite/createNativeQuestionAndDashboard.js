Cypress.Commands.add(
  "createNativeQuestionAndDashboard",
  ({ questionDetails, dashboardDetails } = {}) => {
    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: questionId } }) => {
        cy.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
              cardId: questionId,
              // Add sane defaults for the dashboard card size
              sizeX: 8,
              sizeY: 6,
            });
          },
        );
      },
    );
  },
);
