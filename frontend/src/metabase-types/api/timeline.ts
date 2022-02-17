import { User } from "./user";

export interface Timeline {
  id: number;
  collection_id: number | null;
  name: string;
  description: string | null;
  icon: string;
  archived: boolean;
  events?: TimelineEvent[];
}

export interface TimelineEvent {
  id: number;
  timeline_id: number;
  name: string;
  description: string | null;
  icon: string;
  timestamp: string;
  archived: boolean;
  creator: User;
  created_at: string;
}
