import type { CardType, IconName } from "metabase-types/api";
export type DataPickerDataType =
  | "models"
  | "raw-data"
  | "questions"
  | "metrics"
  | "library";

export type DataTypeInfoItem = {
  id: DataPickerDataType;
  icon: IconName;
  name: string;
  description: string;
};

export type SavedEntityType = Extract<
  CardType,
  "model" | "question" | "metric"
>;
