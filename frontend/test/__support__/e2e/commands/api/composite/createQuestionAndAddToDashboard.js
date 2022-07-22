Cypress.Commands.add(
  "createQuestionAndAddToDashboard",
  (query, dashboardId) => {
    return (
      query.native ? cy.createNativeQuestion(query) : cy.createQuestion(query)
    ).then(response => {
      return cy
        .request("POST", `/api/dashboard/${dashboardId}/cards`, {
          cardId: response.body.id,
        })
        .then(() => response.body);
    });
  },
);
