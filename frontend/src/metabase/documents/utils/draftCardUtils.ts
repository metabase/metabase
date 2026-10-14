import { t } from "ttag";
import _ from "underscore";

import type { Card, CardId, DocumentCardToCreate } from "metabase-types/api";

/**
 * Converts a draft card to the card that saving its document creates
 */
export function getDocumentCardToCreate(
  draftCard: Card,
  sourceCardId?: CardId,
): DocumentCardToCreate {
  return {
    ..._.pick(
      draftCard,
      "dataset_query",
      "display",
      "visualization_settings",
      "parameters",
      "parameter_mappings",
      "result_metadata",
      "cache_ttl",
    ),
    name: draftCard.name.trim() ? draftCard.name : t`Untitled question`,
    description: draftCard.description?.trim() ? draftCard.description : null,
    source_card_id: sourceCardId,
  };
}
