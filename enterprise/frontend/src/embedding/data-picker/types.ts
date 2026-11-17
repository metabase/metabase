import type { CardType, IconName } from "metabase-types/api";
export type DataPickerDataType =
  | "models"
  | "raw-data"
  | "questions"
  | "metrics"
  | "library"
  | "library-data"
  | "library-metrics";

export type DataTypeInfoItem = {
  id: DataPickerDataType;
  icon: IconName;
  name: string;
  description?: string;
};

export type SavedEntityType =
  | Extract<CardType, "model" | "question" | "metric">
  // Tables published in the Library, which aren't cards
  | "table";
