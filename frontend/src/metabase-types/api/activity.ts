import type { CardDisplayType } from "./card";
import type { DatabaseId, InitialSyncStatus } from "./database";

export const ACTIVITY_MODELS = [
  "table",
  "card",
  "dataset",
  "dashboard",
  "collection",
] as const;
export type ActivityModel = typeof ACTIVITY_MODELS[number];

export interface BaseRecentItem {
  id: number;
  name: string;
  model: ActivityModel;
  description?: string | null;
  timestamp: string;
}

export interface RecentTableItem extends BaseRecentItem {
  model: "table";
  display_name: string;
  database: {
    id: number;
    name: string;
    initial_sync_status: InitialSyncStatus;
  };
}

export interface RecentCollectionItem extends BaseRecentItem {
  model: "collection" | "dashboard" | "dataset" | "card";
  can_write: boolean;
  database_id?: DatabaseId; // for models and questions
  parent_collection: {
    id: number | null;
    name: string;
    authority_level?: "official" | null;
  };
  authority_level?: "official" | null; // for collections
  moderated_status?: "verified" | null; // for models
  display?: CardDisplayType; // for questions
}

export type RecentItem = RecentTableItem | RecentCollectionItem;

export interface RecentItemsResponse {
  recent_views: RecentItem[];
}

export type PopularItem = RecentItem;

export interface PopularItemsResponse {
  popular_items: PopularItem[];
}
