import { CollectionId } from "../types/Collection";
import { User } from "./user";

export interface Event {
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

export interface EventTimeline {
  id: number;
  collection_id: CollectionId;
  name: string;
  description?: string;
  default_icon: string;
  archived: boolean;
  events: Event[];
}
