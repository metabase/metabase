import type { CardType, IconName } from "metabase-types/api";
export type DataPickerDataType =
  | "models"
  | "raw-data"
  | "questions"
  | "metrics"
  | "semantic-layer"
  | "semantic-layer-data"
  | "semantic-layer-metrics";

export type DataTypeInfoItem = {
  id: DataPickerDataType;
  icon: IconName;
  name: string;
  description?: string;
};

export type SavedEntityType =
  | Extract<CardType, "model" | "question" | "metric">
  // Tables published in the semantic layer, which aren't cards
  | "table";
