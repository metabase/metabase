import type { IconName } from "metabase-types/api";
export type DataPickerDataType =
  | "models"
  | "raw-data"
  | "questions"
  | "metrics";

export type DataTypeInfoItem = {
  id: DataPickerDataType;
  icon: IconName;
  name: string;
  description: string;
};
