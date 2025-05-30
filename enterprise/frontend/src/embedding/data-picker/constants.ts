import { t } from "ttag";

import type { DataPickerDataType, DataTypeInfoItem } from "./types";

export const CONTAINER_WIDTH = 300;

type DataBucket = "MODELS" | "RAW_DATA" | "SAVED_QUESTIONS";

export const DATA_BUCKET: Record<DataBucket, DataPickerDataType> = {
  MODELS: "models",
  RAW_DATA: "raw-data",
  SAVED_QUESTIONS: "questions",
} as const;

export const MODELS_INFO_ITEM: DataTypeInfoItem = {
  id: DATA_BUCKET.MODELS,
  icon: "model",
  get name() {
    return t`Models`;
  },
  get description() {
    return t`The best starting place for new questions.`;
  },
};

export const RAW_DATA_INFO_ITEM: DataTypeInfoItem = {
  id: DATA_BUCKET.RAW_DATA,
  icon: "database",
  get name() {
    return t`Raw Data`;
  },
  get description() {
    return t`Unaltered tables in connected databases.`;
  },
};

export const SAVED_QUESTIONS_INFO_ITEM: DataTypeInfoItem = {
  id: DATA_BUCKET.SAVED_QUESTIONS,
  icon: "folder",
  get name() {
    return t`Saved Questions`;
  },
  get description() {
    return t`Use any question’s results to start a new question.`;
  },
};
