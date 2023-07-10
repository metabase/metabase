import { DataPickerDataType, DataPickerFilters } from "./types";

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
