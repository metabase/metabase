type EventSchema = {
  event: string;
  target_id?: number | null;
  triggered_from?: string | null;
  duration_ms?: number | null;
  result?: string | null;
  event_detail?: string | null;
};

// Example usage. Remove when adding the first event.
export type DoNotUseEvent1 = {
  event: "do_not_use_1";
  target_id: number | null;
};

// Example usage. Remove when adding the first event.
export type DoNotUseEvent2 = {
  event: "do_not_use_2";
  triggered_from: "location-1" | "location-2";
};

type ValidateEvent<T extends EventSchema> = T;

export type Event = ValidateEvent<DoNotUseEvent1 | DoNotUseEvent2>;
