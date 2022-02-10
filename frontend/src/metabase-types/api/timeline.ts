import { CollectionId } from "./collection";
import { User } from "./user";

export interface Timeline {
  id: number;
  collection_id: CollectionId;
  name: string;
  description?: string;
  icon: string;
  archived: boolean;
  events: TimelineEvent[];
}

export interface TimelineEvent {
  id: number;
  timeline_id: number;
  name: string;
  description?: string;
  icon: string;
  date: string;
  archived: boolean;
  creator: User;
  created_at: string;
}
