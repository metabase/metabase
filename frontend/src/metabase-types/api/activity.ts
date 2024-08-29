import type { DatabaseId, InitialSyncStatus } from "./database";
import type { CardDisplayType } from "./visualization";

import type { Collection } from ".";

export const ACTIVITY_MODELS = [
  "table",
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
] as const;

export type ActivityModel = (typeof ACTIVITY_MODELS)[number];

export const isActivityModel = (model: string): model is ActivityModel =>
  (ACTIVITY_MODELS as unknown as string[]).includes(model);

export const isLoggableActivityModel = (item: {
  id: any;
  model: string;
}): item is { id: number; model: ActivityModel } => {
  return typeof item.id === "number" && isActivityModel(item.model);
};

export type BaseRecentItem = {
  id: number;
  name: string;
  model: ActivityModel;
  description?: string | null;
  timestamp: string;
};

export type RecentTableItem = BaseRecentItem & {
  model: "table";
  display_name: string;
  table_schema: string;
  database: {
    id: number;
    name: string;
    initial_sync_status: InitialSyncStatus;
  };
};

export type RecentCollectionItem = BaseRecentItem & {
  model: "collection" | "dashboard" | "card" | "dataset" | "metric";
  can_write: boolean;
  database_id?: DatabaseId; // for models and questions
  dashboard_id?: number; // TODO: request BE folks add this
  parent_collection: {
    id: number | null;
    name: string;
    authority_level?: "official" | null;
  };
  authority_level?: "official" | null; // for collections
  moderated_status?: "verified" | null; // for models
  display?: CardDisplayType; // for questions
};

export type RecentItem = RecentTableItem | RecentCollectionItem;

export const isRecentTableItem = (item: RecentItem): item is RecentTableItem =>
  item.model === "table";

export interface RecentItemsResponse {
  recent_views: RecentItem[];
}

export type RecentContexts = "selections" | "views";

export interface RecentsRequest {
  context: RecentContexts[];
}

export interface RecentsResponse {
  recents: RecentItem[];
}

export type PopularItem = RecentItem;

export interface PopularItemsResponse {
  popular_items: PopularItem[];
}

export interface CreateRecentRequest {
  model_id: number;
  model: ActivityModel;
  context: "selection";
}
