import _ from "underscore";

import type { AllocatedPeopleSegment } from "../segments/types";

import type { AllocatedEvent, FlagAllocator } from "./types";

/**
 * Gives each event and people segment a flag column on `events_base` as the
 * spec uses it, numbered in order of first use. Identical events share a
 * flag, and so do segments with the same definition.
 */
export const createFlagAllocator = (): FlagAllocator => {
  const events: AllocatedEvent[] = [];
  const segments: AllocatedPeopleSegment[] = [];

  const flagFor: FlagAllocator["flagFor"] = (event) => {
    const allocated = events.find((other) => _.isEqual(other.event, event));
    if (allocated !== undefined) {
      return allocated.flag;
    }
    const flag = `ev_${events.length + 1}`;
    events.push({ flag, event });
    return flag;
  };

  const segmentFlagFor: FlagAllocator["segmentFlagFor"] = (segment) => {
    const allocated = segments.find((other) =>
      _.isEqual(other.segment.definition, segment.definition),
    );
    if (allocated !== undefined) {
      return allocated.flag;
    }
    const flag = `seg_${segments.length + 1}`;
    segments.push({ flag, segment });
    return flag;
  };

  return { events, segments, flagFor, segmentFlagFor };
};
