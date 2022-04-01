export type ModelType = "table" | "card" | "dataset" | "dashboard";

export interface ModelObject {
  name: string;
}

export interface RecentView {
  model: ModelType;
  model_object: ModelObject;
}

export interface PopularView {
  model: ModelType;
  model_object: ModelObject;
}
