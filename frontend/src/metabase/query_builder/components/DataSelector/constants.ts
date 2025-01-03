import { t } from "ttag";

import type { DataPickerDataType, DataTypeInfoItem } from "./types";

export const CONTAINER_WIDTH = 300;

export const DATA_BUCKET: Record<string, DataPickerDataType> = {
  MODELS: "models",
  RAW_DATA: "raw-data",
  SAVED_QUESTIONS: "questions",
  METRICS: "metrics",
} as const;

export const MODELS_INFO_ITEM: DataTypeInfoItem = {
  id: DATA_BUCKET.MODELS,
  icon: "model",
  name: t`Models`,
  description: t`The best starting place for new questions.`,
};

export const RAW_DATA_INFO_ITEM: DataTypeInfoItem = {
  id: DATA_BUCKET.RAW_DATA,
  icon: "database",
  name: t`Raw Data`,
  description: t`Unaltered tables in connected databases.`,
};

export const SAVED_QUESTIONS_INFO_ITEM: DataTypeInfoItem = {
  id: DATA_BUCKET.SAVED_QUESTIONS,
  icon: "folder",
  name: t`Saved Questions`,
  description: t`Use any question’s results to start a new question.`,
};

export const METRICS_INFO_ITEM: DataTypeInfoItem = {
  id: DATA_BUCKET.METRICS,
  icon: "metric",
  name: t`Metrics`,
  description: t`Trustworthy definitions to start from.`,
};
