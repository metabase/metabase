import type {
  ActionDashboardCard,
  BaseDashboardOrderedCard,
  DashboardOrderedCard,
  Card,
  Dashboard,
} from "metabase-types/api";

export const isActionCard = (card: Card) => card?.display === "action";

export function isActionDashCard(
  dashCard: BaseDashboardOrderedCard,
): dashCard is ActionDashboardCard {
  const virtualCard = dashCard?.visualization_settings?.virtual_card;
  return isActionCard(virtualCard as Card);
}

export const isButtonLinkDashCard = (dashCard: BaseDashboardOrderedCard) =>
  isActionDashCard(dashCard) &&
  dashCard.visualization_settings?.click_behavior?.type === "link";

/**
 * Checks if a dashboard card is an explicit action (has associated WritebackAction).
 *
 * @param {BaseDashboardOrderedCard} dashboard card
 *
 * @returns {boolean} true if the button has an associated action.
 * False for implicit actions using click behavior, and in case a button has no action attached
 */
export function isMappedExplicitActionButton(
  dashCard: BaseDashboardOrderedCard,
): dashCard is ActionDashboardCard {
  const isAction = isActionDashCard(dashCard);
  return Boolean(
    isAction && dashCard.action && dashCard.action.type !== "implicit",
  );
}

export function getActionButtonLabel(dashCard: ActionDashboardCard) {
  const label = dashCard.visualization_settings?.["button.label"];
  return label || "";
}

const VIZ_TYPES_TO_HIDE_HEADER = ["object"];
const VIZ_TYPES_TO_HIDE_HEADER_IN_APPS = ["object", "list"];

export const shouldHideDashcardHeader = (
  dashboard: Dashboard,
  dashcard: DashboardOrderedCard,
): boolean => {
  const headerHiddenVizTypes = dashboard.is_app_page
    ? VIZ_TYPES_TO_HIDE_HEADER_IN_APPS
    : VIZ_TYPES_TO_HIDE_HEADER;

  const dashcardDisplayType = dashcard?.card?.display ?? "";

  return headerHiddenVizTypes.includes(dashcardDisplayType);
};
