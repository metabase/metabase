import type { JevNewDashcard } from "metabase/api/jev-create";
import type { CardId } from "metabase-types/api";

export const JEV_DASHCARD_WIDTH = 12;
export const JEV_DASHCARD_HEIGHT = 6;
const CARDS_PER_ROW = 2;

/** New dashcards for `cardIds` in reading order, two per row on the 24-column grid. */
export function getJevDashcardLayout(
  cardIds: readonly CardId[],
): JevNewDashcard[] {
  return cardIds.map((cardId, index) => ({
    id: -(index + 1),
    card_id: cardId,
    col: (index % CARDS_PER_ROW) * JEV_DASHCARD_WIDTH,
    row: Math.floor(index / CARDS_PER_ROW) * JEV_DASHCARD_HEIGHT,
    size_x: JEV_DASHCARD_WIDTH,
    size_y: JEV_DASHCARD_HEIGHT,
  }));
}
