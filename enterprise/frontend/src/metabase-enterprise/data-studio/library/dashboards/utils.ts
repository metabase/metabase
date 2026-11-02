import { isQuestionDashCard } from "metabase/utils/dashboard";
import type { Card, Dashboard, UnreadableCard } from "metabase-types/api";

/**
 * The cards a dashboard's question dashcards show, series included, in
 * dashcard order and as the API sends them, so a card the user cannot read is
 * a bare `{ id }`.
 */
export function getDashcardCards(
  dashboard: Pick<Dashboard, "dashcards">,
): (Card | UnreadableCard)[] {
  return dashboard.dashcards
    .filter(isQuestionDashCard)
    .flatMap((dashcard) => [dashcard.card, ...(dashcard.series ?? [])]);
}
