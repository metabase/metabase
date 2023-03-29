Cypress.Commands.add(
  "createQuestionAndAddToDashboard",
  (query, dashboardId) => {
    return (
      query.native ? cy.createNativeQuestion(query) : cy.createQuestion(query)
    ).then(response => {
      return cy
        .request("POST", `/api/dashboard/${dashboardId}/cards`, {
          cardId: response.body.id,
          // Add sane defaults for the dashboard card size and position
          row: 0,
          col: 0,
          size_x: 8,
          size_y: 6,
        })
        .then(() => response.body);
    });
  },
);
