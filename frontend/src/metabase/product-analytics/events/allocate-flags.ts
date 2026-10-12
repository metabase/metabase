import type {
  AllocatedEvent,
  EventAllocation,
  EventDefinition,
  EventRef,
} from "./types";

/**
 * Gives every event in use a flag column on `events_base`. A flag is named by
 * the event's position in `savedEvents`, so picking or dropping one event
 * doesn't rename the others' columns.
 */
export const allocateFlags = (
  eventIds: readonly string[],
  savedEvents: readonly EventDefinition[],
): EventAllocation => {
  const events: AllocatedEvent[] = savedEvents.flatMap((event, index) =>
    eventIds.includes(event.id) ? [{ flag: `ev_${index + 1}`, event }] : [],
  );

  const flagFor = (ref: EventRef): string => {
    const allocated = events.find(({ event }) => event.id === ref.id);
    if (allocated === undefined) {
      throw new Error(`Event ${ref.id} has no flag column`);
    }
    return allocated.flag;
  };

  const nameFor = (ref: EventRef): string =>
    savedEvents.find((event) => event.id === ref.id)?.name ?? ref.id;

  return { events, flagFor, nameFor };
};
