export type ModelType = "table" | "card" | "dataset" | "dashboard";

export interface ModelObject {
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
