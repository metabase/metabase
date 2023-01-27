import { CardId } from "./card";
import { Collection, RegularCollectionId } from "./collection";
import { UserInfo } from "./user";

export type TimelineId = number;
export type TimelineEventId = number;
export type TimelineEventSource = "question" | "collections" | "api";

export interface Timeline extends TimelineData {
  id: TimelineId;
  collection?: Collection;
  events?: TimelineEvent[];
}

export interface TimelineData {
  id?: TimelineId;
  collection_id: RegularCollectionId | null;
  name: string;
  description: string | null;
  icon: string;
  default: boolean;
  archived: boolean;
}

export interface TimelineEvent extends TimelineEventData {
  id: TimelineEventId;
  timeline_id: TimelineId;
  creator: UserInfo;
  created_at: string;
}

export interface TimelineEventData {
  id?: number;
  timeline_id?: TimelineId;
  name: string;
  description: string | null;
  icon: string;
  timestamp: string;
  timezone: string;
  time_matters: boolean;
  archived: boolean;
  source?: TimelineEventSource;
  question_id?: CardId;
}
