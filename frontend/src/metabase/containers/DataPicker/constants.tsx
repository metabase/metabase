import { t } from "ttag";

import {
  DataPickerDataType,
  DataPickerFilters,
  DataTypeInfoItem,
} from "./types";

export const MIN_SEARCH_LENGTH = 2;

export const DATA_BUCKET: Record<string, DataPickerDataType> = {
  DATASETS: "models",
  RAW_DATA: "raw-data",
  SAVED_QUESTIONS: "questions",
} as const;

export const DEFAULT_DATA_PICKER_FILTERS: DataPickerFilters = {
  types: () => true,
  databases: () => true,
  schemas: () => true,
  tables: () => true,
};

export const DATASETS_INFO_ITEM: DataTypeInfoItem = {
  id: DATA_BUCKET.DATASETS,
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
  name: t`Saved Questions`,
  icon: "folder",
  description: t`Use any question’s results to start a new question.`,
};
