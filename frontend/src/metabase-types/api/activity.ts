export type ActivityItemId = number | string;
export type ActivityItemModel = "table" | "card" | "dataset" | "dashboard";

export interface ActivityModelObject {
  id: ActivityItemId;
  name: string;
  display_name?: string;
  moderated_status?: string;
}

export interface RecentItem {
  cnt: number;
  max_ts: string;
  model_id: number;
  user_id: number;
  model: ActivityItemModel;
  model_object: ActivityModelObject;
}

export interface PopularItem {
  model: ActivityItemModel;
  model_object: ActivityModelObject;
}
