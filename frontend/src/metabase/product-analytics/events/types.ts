import type { OpaqueDatasetQuery } from "metabase-types/api";

import type {
  AllocatedPeopleSegment,
  PeopleSegmentRef,
} from "../segments/types";

/**
 * An event, defined by filters on the event table. Only the query's filters
 * are used, ANDed together.
 */
export type EventDefinition = {
  name: string;
  query: OpaqueDatasetQuery;
};

/** An event in use, with its flag column on `events_base`. */
export type AllocatedEvent = {
  flag: string;
  event: EventDefinition;
};

/** How a spec refers to an event or a people segment: by its flag column. */
export type EventFlags = {
  flagFor: (event: EventDefinition) => string;
  segmentFlagFor: (segment: PeopleSegmentRef) => string;
};

export type FlagAllocator = EventFlags & {
  /** The events given a flag so far. */
  events: readonly AllocatedEvent[];
  /** The people segments given a flag so far. */
  segments: readonly AllocatedPeopleSegment[];
};
