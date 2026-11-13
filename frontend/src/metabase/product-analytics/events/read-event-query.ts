import * as Lib from "metabase-lib";

import type { EventDefinition } from "./types";

/**
 * The event's query, or `null` when it can't be read, e.g. a stored
 * definition from a URL that was edited by hand.
 */
export const readEventQuery = (
  metadataProvider: Lib.MetadataProvider,
  event: EventDefinition,
): Lib.Query | null => {
  try {
    const query = Lib.fromJsQuery(metadataProvider, event.query);
    return Lib.stageCount(query) > 0 ? query : null;
  } catch {
    return null;
  }
};
