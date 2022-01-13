Cypress.Commands.add(
  "createQuestionAndAddToDashboard",
  (query, dashboardId) => {
    return cy.createQuestion(query).then(response => {
      cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
        cardId: response.body.id,
      });
    });
  },
);
