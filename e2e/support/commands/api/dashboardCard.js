import _ from "underscore";

Cypress.Commands.add(
  "editDashboardCard",
  (dashboardCard, updatedProperties) => {
    const { id, dashboard_id } = dashboardCard;

    const cleanCard = sanitizeCard(dashboardCard);

    const updatedCard = Object.assign({}, cleanCard, updatedProperties);

    cy.log(`Edit dashboard card ${id}`);
    cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
      dashcards: [updatedCard],
    });
  },
);

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
