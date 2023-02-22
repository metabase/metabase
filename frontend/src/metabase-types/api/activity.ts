export type ModelType = "table" | "card" | "dataset" | "dashboard";

export interface ModelObject {
  name: string;
}

export interface RecentItem {
  model: ModelType;
  model_object: ModelObject;
}

export interface PopularItem {
  model: ModelType;
  model_object: ModelObject;
}
