Cypress.Commands.add(
  "createNativeQuestionAndDashboard",
  ({ questionDetails, dashboardName = "Custom dashboard" } = {}) => {
    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: questionId } }) => {
        cy.createDashboard(dashboardName).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
              card_id: questionId,
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
