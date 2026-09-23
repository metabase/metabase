import { uuid } from "metabase/utils/uuid";
import type { CardId, DocumentContent } from "metabase-types/api";

/**
 * A new document's content: one embed per card, in order, shaped like the
 * editor's own (a `resizeNode` around a `cardEmbed`, with a node `_id`).
 * The backend clones embedded cards the document doesn't own.
 */
export function getJevDocumentContent(
  cardIds: readonly CardId[],
  createNodeId: () => string = uuid,
): DocumentContent {
  return {
    type: "doc",
    content: cardIds.map((cardId) => ({
      type: "resizeNode",
      content: [
        { type: "cardEmbed", attrs: { id: cardId, _id: createNodeId() } },
      ],
    })),
  };
}
