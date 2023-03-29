import _ from "underscore";

import type { Dashboard, DashboardOrderedCard } from "metabase-types/api";

export function hasDashboardChanged(
  dashboard: Dashboard,
  dashboardBeforeEditing: Dashboard,
) {
  return !_.isEqual(
    { ...dashboard, ordered_cards: dashboard.ordered_cards.length },
    {
      ...dashboardBeforeEditing,
      ordered_cards: dashboardBeforeEditing.ordered_cards.length,
    },
  );
}

// sometimes the cards objects change order but all the cards themselves are the same
// this should not trigger a save
export function haveDashboardCardsChanged(
  newCards: DashboardOrderedCard[],
  oldCards: DashboardOrderedCard[],
) {
  return (
    !newCards.every(newCard =>
      oldCards.some(oldCard => _.isEqual(oldCard, newCard)),
    ) ||
    !oldCards.every(oldCard =>
      newCards.some(newCard => _.isEqual(oldCard, newCard)),
    )
  );
}
