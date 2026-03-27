import type { OmniPickerItem } from "metabase/common/components/Pickers";

import type { CollectionId, CollectionType } from "./collection";
import type { DashboardId } from "./dashboard";
import type { DatabaseId, InitialSyncStatus } from "./database";
import type { ModerationReviewStatus } from "./moderation";
import type { CardDisplayType } from "./visualization";

export const ACTIVITY_MODELS = [
  "table",
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "document",
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

export type RecentTableDatabaseInfo = {
  id: number;
  name: string;
  initial_sync_status: InitialSyncStatus;
};

export type RecentTableItem = BaseRecentItem & {
  model: "table";
  display_name: string;
  table_schema: string;
  database: RecentTableDatabaseInfo;
};

export type RecentCollectionItem = BaseRecentItem & {
  model:
    | "collection"
    | "dashboard"
    | "card"
    | "dataset"
    | "metric"
    | "document";
  can_write: boolean;
  database_id?: DatabaseId; // for models and questions
  parent_collection: {
    id: CollectionId | null;
    name: string;
    authority_level?: "official" | null;
  };
  authority_level?: "official" | null; // for collections
  moderated_status?: "verified" | null; // for cards / models / dashboards
  display?: CardDisplayType; // for questions
  dashboard?: {
    name: string;
    id: DashboardId;
    moderation_status: ModerationReviewStatus;
  };
  collection_type?: CollectionType;
};

export type RecentItem = RecentTableItem | RecentCollectionItem;

export const isRecentTableItem = (item: RecentItem): item is RecentTableItem =>
  item.model === "table";

export const isRecentCollectionItem = (
  item: OmniPickerItem,
): item is RecentCollectionItem =>
  ["collection", "dashboard", "card", "dataset", "metric"].includes(item.model);

export interface RecentItemsResponse {
  recent_views: RecentItem[];
}

export type RecentContexts = "selections" | "views";

export interface RecentsRequest {
  context?: RecentContexts[];
  include_metadata?: boolean;
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
