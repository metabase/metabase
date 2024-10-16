import _ from "underscore";

import type { Dashboard, DashboardCard } from "metabase-types/api";

export const editDashboardCard = (
  dashboardCard: DashboardCard,
  updatedProperties: Partial<DashboardCard>,
): Cypress.Chainable<Cypress.Response<Dashboard>> => {
  const { id, dashboard_id } = dashboardCard;

  const cleanCard = sanitizeCard(dashboardCard);

  const updatedCard = Object.assign({}, cleanCard, updatedProperties);

  cy.log(`Edit dashboard card ${id}`);
  return cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
    dashcards: [updatedCard],
  });
};

/**
 * Remove `created_at` and `updated_at` fields from the dashboard card that was previously added to the dashboard.
 * We don't want to hard code these fields in the next request that we'll pass the card object to.
 *
 * @param card - "Old", or the existing dashboard card.
 */
function sanitizeCard(card: DashboardCard) {
  return _.omit(card, ["created_at", "updated_at"]);
}
