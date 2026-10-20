import * as Lib from "metabase-lib";

import type { EventDefinition } from "../events/types";
import { segmentToEventDefinition } from "../segments/to-event-definition";
import type { SavedPaletteSegment } from "../segments/types";

import type { EventInsightAttribute } from "./types";

/** Each segment is checked as done at least this many times. */
const MIN_COUNTS = [1, 3, 10];
/**
 * Each segment adds a count per actor per period to the population, so many
 * of them make the queries slow. See post-prototype.md.
 */
const MAX_SEGMENTS = 20;

type GetEventAttributesArgs = {
  segments: readonly SavedPaletteSegment[];
  tableQuery: Lib.Query;
  metadataProvider: Lib.MetadataProvider;
  /**
   * The events the analysis is defined by. Comparing by them would be
   * circular: what counts as being active trivially predicts being active.
   */
  excluded: readonly EventDefinition[];
};

/**
 * The event table's saved segments as attributes: whether an actor did each
 * one at least once, 3 times and 10 times. Segments the analysis is defined
 * by are left out.
 */
export const getEventAttributes = ({
  segments,
  tableQuery,
  metadataProvider,
  excluded,
}: GetEventAttributesArgs): EventInsightAttribute[] =>
  segments
    .flatMap((segment) => {
      const event = segmentToEventDefinition(
        tableQuery,
        metadataProvider,
        segment,
      );
      const isExcluded =
        event !== undefined &&
        // Not deep equality: each copy of a query has its own clause ids.
        excluded.some((other) =>
          Lib.areLegacyQueriesEqual(other.query, event.query),
        );
      return event !== undefined && !isExcluded ? [{ segment, event }] : [];
    })
    .slice(0, MAX_SEGMENTS)
    .flatMap(({ segment, event }, segmentIndex) =>
      MIN_COUNTS.map((minCount) => ({
        segment,
        event,
        segmentIndex,
        minCount,
      })),
    )
    .map(({ segment, event, segmentIndex, minCount }, index) => ({
      kind: "event",
      id: `attr_${index + 1}`,
      flag: `seg_${segmentIndex + 1}`,
      event,
      displayName: segment.name,
      description: segment.description,
      minCount,
    }));
