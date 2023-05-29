Cypress.Commands.add(
  "createQuestionAndAddToDashboard",
  (query, dashboardId, card) =>
    (query.native
      ? cy.createNativeQuestion(query)
      : cy.createQuestion(query)
    ).then(({ body: { id: card_id } }) =>
      cy
        .request(`/api/dashboard/${dashboardId}`)
        .then(({ body: { ordered_cards } }) =>
          cy
            .request("PUT", `/api/dashboard/${dashboardId}/cards`, {
              cards: [
                ...ordered_cards,
                {
                  id: -1,
                  card_id,
                  // Add sane defaults for the dashboard card size and position
                  row: 0,
                  col: 0,
                  size_x: 11,
                  size_y: 11,
                  ...card,
                },
              ],
            })
            .then(response => ({
              ...response,
              body: response.body.cards[0],
            })),
        ),
    ),
);
