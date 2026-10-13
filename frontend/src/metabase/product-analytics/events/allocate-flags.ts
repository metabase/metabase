import _ from "underscore";

import type { AllocatedEvent, EventDefinition, FlagAllocator } from "./types";

/**
 * Gives each event a flag column on `events_base` as the spec uses it,
 * numbered in order of first use. Identical events share a flag.
 */
export const createFlagAllocator = (): FlagAllocator => {
  const events: AllocatedEvent[] = [];

  const flagFor = (event: EventDefinition): string => {
    const allocated = events.find((other) => _.isEqual(other.event, event));
    if (allocated !== undefined) {
      return allocated.flag;
    }
    const flag = `ev_${events.length + 1}`;
    events.push({ flag, event });
    return flag;
  };

  return { events, flagFor };
};
