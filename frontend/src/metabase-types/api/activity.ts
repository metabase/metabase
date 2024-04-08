import type { UserId } from "./user";

export type ActivityModel = "table" | "card" | "dataset" | "dashboard";
export type ActivityModelId = number;

export interface ActivityModelObject {
  name: string;
  display_name?: string;
  moderated_status?: string;
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
