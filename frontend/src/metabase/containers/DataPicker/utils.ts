import {
  MODELS_INFO_ITEM,
  RAW_DATA_INFO_ITEM,
  SAVED_QUESTIONS_INFO_ITEM,
} from "./constants";
import type { DataTypeInfoItem } from "./types";

export function getDataTypes({
  hasModels,
  hasNestedQueriesEnabled,
  hasSavedQuestions,
}: {
  hasModels: boolean;
  hasNestedQueriesEnabled: boolean;
  hasSavedQuestions: boolean;
}): DataTypeInfoItem[] {
  const dataTypes: DataTypeInfoItem[] = [];

  if (hasNestedQueriesEnabled && hasModels) {
    dataTypes.push(MODELS_INFO_ITEM);
  }

  dataTypes.push(RAW_DATA_INFO_ITEM);

  if (hasNestedQueriesEnabled && hasSavedQuestions) {
    dataTypes.push(SAVED_QUESTIONS_INFO_ITEM);
  }

  return dataTypes;
}
