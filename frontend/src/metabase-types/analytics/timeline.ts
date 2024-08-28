import type { CardId, CollectionId } from "metabase-types/api";

export type NewEventCreatedEvent = {
  event: "new_event_created";
  source?: "questions" | "collections" | "api";
  question_id?: CardId;
  collection_id?: CollectionId;
  time_matters?: boolean;
};

export type TimelineEvent = NewEventCreatedEvent;
