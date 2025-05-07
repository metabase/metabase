import type { IconName } from "metabase/ui";

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
