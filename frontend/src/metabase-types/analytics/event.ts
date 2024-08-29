import type { ValidateSchema } from "./utils";

type SimpleEventSchema = {
  event: string;
  target_id?: number | null;
  triggered_from?: string | null;
  duration_ms?: number | null;
  result?: string | null;
  event_detail?: string | null;
};

type ValidateEvent<T extends SimpleEventSchema> = ValidateSchema<
  T,
  SimpleEventSchema
>;

// Example usage. Remove when adding the first event.
export type DoNotUseEvent1 = ValidateEvent<{
  event: "do_not_use_1";
  target_id: number | null;
}>;

// Example usage. Remove when adding the first event.
export type DoNotUseEvent2 = ValidateEvent<{
  event: "do_not_use_2";
  triggered_from: "location-1" | "location-2";
}>;

export type SimpleEvent = DoNotUseEvent1 | DoNotUseEvent2;
