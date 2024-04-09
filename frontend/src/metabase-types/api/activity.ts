export type ModelType = "table" | "card" | "dataset" | "dashboard";

export interface ModelObject {
  display_name?: string;
  moderated_status?: string;
  name: string;
}

export interface RecentItem {
  cnt: number;
  max_ts: string;
  model_id: number;
  user_id: number;
  model: ModelType;
  model_object: ModelObject;
}

export interface PopularItem {
  model: ModelType;
  model_object: ModelObject;
}
