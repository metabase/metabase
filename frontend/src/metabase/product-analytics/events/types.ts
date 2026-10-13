import type { OpaqueDatasetQuery } from "metabase-types/api";

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

/** How a spec refers to an event: by its flag column. */
export type EventFlags = {
  flagFor: (event: EventDefinition) => string;
};

export type FlagAllocator = EventFlags & {
  /** The events given a flag so far. */
  events: readonly AllocatedEvent[];
};
