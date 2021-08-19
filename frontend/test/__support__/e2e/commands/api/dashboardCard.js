import _ from "underscore";

Cypress.Commands.add("editDashboardCard", (oldCard, newCard) => {
  const { id, dashboard_id } = oldCard;

  const cleanOldCard = sanitizeCard(oldCard);

  const updatedCard = Object.assign({}, cleanOldCard, newCard);

  cy.log(`Edit dashboard card ${id}`);
  cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
    cards: [updatedCard],
  });
});

/**
 * Remove `created_at` and `updated_at` fields from the dashboard card that was previously added to the dashboard.
 * We don't want to hard code these fields in the next request that we'll pass the card object to.
 *
 * @param {Object} card - "Old", or the existing dashboard card.
 * @returns {Object}
 */
function sanitizeCard(card) {
  return _.omit(card, ["created_at", "updated_at"]);
}
