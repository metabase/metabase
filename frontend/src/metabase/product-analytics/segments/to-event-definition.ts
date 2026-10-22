import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

import { getConditionsName } from "../events/conditions-name";
import { readEventQuery } from "../events/read-event-query";
import type { EventDefinition } from "../events/types";

import type { PaletteSegment } from "./types";

const STAGE_INDEX = -1;

/** Whether an event slot can take this segment. */
export const isEventSegment = (segment: PaletteSegment): boolean =>
  segment.source === "event" && segment.status !== "sample";

/** Whether the people filter can take this segment. Samples have no conditions. */
export const isPeopleSegment = (segment: PaletteSegment): boolean =>
  segment.source === "people" && segment.status !== "sample";

/**
 * The event a segment defines. A saved segment becomes a segment clause on
 * the table, so the event follows later edits to the segment; when the table's
 * metadata doesn't know the segment yet, its conditions are copied instead. A
 * draft becomes its own conditions. Undefined when neither can be read.
 */
/**
 * What to add to a query to require the segment: the segment clause itself
 * when the table's metadata knows it, else the segment's own conditions.
 */
const segmentFilterables = (
  tableQuery: Lib.Query,
  metadataProvider: Lib.MetadataProvider,
  segment: PaletteSegment,
): Lib.Filterable[] => {
  switch (segment.status) {
    case "draft": {
      const query = readSegmentDefinition(metadataProvider, segment.query);
      return query !== undefined ? Lib.filters(query, STAGE_INDEX) : [];
    }
    case "saved": {
      const metadata = Lib.segmentMetadata(tableQuery, segment.segment.id);
      if (metadata !== null) {
        return [metadata];
      }
      const query = readSegmentDefinition(
        metadataProvider,
        segment.segment.definition,
      );
      return query !== undefined ? Lib.filters(query, STAGE_INDEX) : [];
    }
    case "sample":
      return [];
  }
};

/**
 * The event with the segment added as one more condition. Its name follows
 * the conditions unless the user had named it. Undefined when the event or
 * the segment can't be read.
 */
export const addSegmentToEvent = (
  tableQuery: Lib.Query,
  metadataProvider: Lib.MetadataProvider,
  event: EventDefinition,
  segment: PaletteSegment,
): EventDefinition | undefined => {
  const query = readEventQuery(metadataProvider, event);
  const filterables = segmentFilterables(tableQuery, metadataProvider, segment);
  if (query === null || filterables.length === 0) {
    return undefined;
  }
  const nextQuery = filterables.reduce(
    (current, filterable) => Lib.filter(current, STAGE_INDEX, filterable),
    query,
  );
  const isAutoNamed = event.name === getConditionsName(query);
  return {
    name: isAutoNamed ? getConditionsName(nextQuery) : event.name,
    query: Lib.toJsQuery(nextQuery),
  };
};

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
          : readSegmentDefinition(metadataProvider, segment.segment.definition);
      return query !== undefined
        ? { name: segment.name, query: Lib.toJsQuery(query) }
        : undefined;
    }
    case "sample":
      return undefined;
  }
};

/** A segment's definition as a query; undefined when it has no readable conditions. */
export const readSegmentDefinition = (
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
