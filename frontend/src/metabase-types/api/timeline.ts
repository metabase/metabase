import type { CardId } from "./card";
import type {
  Collection,
  CollectionId,
  RegularCollectionId,
} from "./collection";
import type { UserInfo } from "./user";

export type TimelineId = number;
export type TimelineEventId = number;
export type TimelineEventSource = "question" | "collections" | "api";

export type TimelineIcon =
  | "star"
  | "cake"
  | "mail"
  | "warning"
  | "bell"
  | "cloud";

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
  icon: TimelineIcon;
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
  icon: TimelineIcon;
  timestamp: string;
  timezone: string;
  time_matters: boolean;
  archived: boolean;
  source?: TimelineEventSource;
  question_id?: CardId;
}

export interface ListTimelinesRequest {
  include?: "events";
  archived?: boolean;
}

export interface ListCollectionTimelinesRequest {
  id: CollectionId;
  include?: "events";
  archived?: boolean;
}

export interface GetTimelineRequest {
  id: TimelineId;
  include?: "events";
  archived?: boolean;
  start?: string;
  end?: string;
}

export interface CreateTimelineRequest {
  name: string;
  default?: boolean;
  description?: string | null;
  icon?: TimelineIcon;
  collection_id?: RegularCollectionId | null;
  archived?: boolean;
}

export interface UpdateTimelineRequest {
  id: TimelineId;
  name?: string;
  default?: boolean;
  description?: string | null;
  icon?: TimelineIcon;
  collection_id?: RegularCollectionId | null;
  archived?: boolean;
}

export interface CreateTimelineEventRequest {
  name: string;
  description?: string | null;
  timestamp: string;
  time_matters?: boolean;
  timezone: string;
  icon?: TimelineIcon;
  timeline_id: TimelineId;
  source?: TimelineEventSource;
  question_id?: CardId;
  archived?: boolean;
}

export interface UpdateTimelineEventRequest {
  id: TimelineEventId;
  name?: string;
  description?: string | null;
  timestamp?: string;
  time_matters?: boolean;
  timezone?: string;
  icon?: TimelineIcon;
  timeline_id?: TimelineId;
  source?: TimelineEventSource;
  question_id?: CardId;
  archived?: boolean;
}
