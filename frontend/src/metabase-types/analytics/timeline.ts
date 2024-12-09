type TimelineEventSchema = {
  event: string;
  source?: string | null;
  question_id?: number | null;
  collection_id?: number | null;
  time_matters?: boolean | null;
};

type ValidateEvent<
  T extends TimelineEventSchema &
    Record<Exclude<keyof T, keyof TimelineEventSchema>, never>,
> = T;

export type NewEventCreatedEvent = ValidateEvent<{
  event: "new_event_created";
  source: "questions" | "collections" | "api";
  question_id: number | null;
  collection_id: number | null;
  time_matters: boolean;
}>;

export type TimelineEvent = NewEventCreatedEvent;
