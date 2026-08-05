import type { Dashboard } from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards";

export function cardsContainCustomViz(cards: { display?: unknown }[]): boolean {
  return cards.some((card) => isCustomVizDisplay(card.display));
}

export function dashboardContainsCustomViz(
  dashboard: Dashboard | null | undefined,
): boolean {
  const dashcards = dashboard?.dashcards ?? [];
  return cardsContainCustomViz(dashcards.map((dashcard) => dashcard.card));
}
