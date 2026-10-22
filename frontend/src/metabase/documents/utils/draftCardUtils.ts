import _ from "underscore";

import { getNonBlankNameAndDescription } from "metabase/common/utils/card";
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
    ...getNonBlankNameAndDescription(draftCard),
    source_card_id: sourceCardId,
  };
}
