import type { CollectionId } from "./collection";
import type { DatabaseId } from "./database";
import type { UserId } from "./user";

export const ACTIVITY_MODELS = [
  "table",
  "card",
  "dataset",
  "dashboard",
] as const;
export type ActivityModel = typeof ACTIVITY_MODELS[number];
export type ActivityModelId = number;

export interface ActivityModelObject {
  name: string;
  display_name?: string;
  moderated_status?: string;
  collection_id?: CollectionId;
  collection_name?: string;
  database_name?: string;
  db_id?: DatabaseId;
}

export interface RecentItem {
  cnt: number;
  max_ts: string;
  user_id: UserId;
  model: ActivityModel;
  model_id: ActivityModelId;
  model_object: ActivityModelObject;
}

export interface PopularItem {
  model: ActivityModel;
  model_id: ActivityModelId;
  model_object: ActivityModelObject;
}
