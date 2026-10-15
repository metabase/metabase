import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

import type { EventDefinition } from "../events/types";

import type { PaletteSegment } from "./types";

const STAGE_INDEX = -1;

/** Whether an event slot can take this segment. */
export const isEventSegment = (segment: PaletteSegment): boolean =>
  segment.source === "event" && segment.status !== "sample";

/** Whether the people filter can take this segment. */
export const isPeopleSegment = (segment: PaletteSegment): boolean =>
  segment.source === "people";

/**
 * The event a segment defines. A saved segment becomes a segment clause on
 * the table, so the event follows later edits to the segment; when the table's
 * metadata doesn't know the segment yet, its conditions are copied instead. A
 * draft becomes its own conditions. Undefined when neither can be read.
 */
export const segmentToEventDefinition = (
  tableQuery: Lib.Query,
  metadataProvider: Lib.MetadataProvider,
  segment: PaletteSegment,
): EventDefinition | undefined => {
  switch (segment.status) {
    case "draft":
      return { name: segment.name, query: segment.query };
    case "saved": {
      const metadata = Lib.segmentMetadata(tableQuery, segment.segment.id);
      const query =
        metadata !== null
          ? Lib.filter(tableQuery, STAGE_INDEX, metadata)
          : readDefinition(metadataProvider, segment.segment.definition);
      return query !== undefined
        ? { name: segment.name, query: Lib.toJsQuery(query) }
        : undefined;
    }
    case "sample":
      return undefined;
  }
};

const readDefinition = (
  metadataProvider: Lib.MetadataProvider,
  definition: DatasetQuery,
): Lib.Query | undefined => {
  try {
    const query = Lib.fromJsQuery(metadataProvider, definition);
    return Lib.filters(query, STAGE_INDEX).length > 0 ? query : undefined;
  } catch {
    return undefined;
  }
};
