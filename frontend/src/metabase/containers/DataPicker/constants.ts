import { DataPickerFilters } from "./types";

export const MIN_SEARCH_LENGTH = 2;

export const DATA_BUCKET = {
  DATASETS: "datasets",
  RAW_DATA: "raw-data",
  SAVED_QUESTIONS: "saved-questions",
};

export const DEFAULT_DATA_PICKER_FILTERS: DataPickerFilters = {
  types: () => true,
  databases: () => true,
  schemas: () => true,
  tables: () => true,
};
