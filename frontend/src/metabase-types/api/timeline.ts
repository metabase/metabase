import { Collection } from "./collection";
import { User } from "./user";

export interface Timeline {
  id: number;
  collection_id: number | null;
  name: string;
  description: string | null;
  icon: string;
  default: boolean;
  archived: boolean;
  collection?: Collection;
  events?: TimelineEvent[];
}

export interface TimelineData {
  id?: number;
  collection_id: number | null;
  name: string;
  description: string | null;
  icon: string;
  default: boolean;
  archived: boolean;
}

export interface TimelineEvent extends TimelineEventData {
  id: number;
  creator: User;
  created_at: string;
}

export interface TimelineEventData {
  id?: number;
  timeline_id: number;
  name: string;
  description: string | null;
  icon: string;
  timestamp: string;
  timezone: string;
  time_matters: boolean;
  archived: boolean;
}

export type TimelineEventSource = "question" | "collections" | "api";
