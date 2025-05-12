import { MODELS_INFO_ITEM, RAW_DATA_INFO_ITEM } from "./constants";
import type { DataTypeInfoItem } from "./types";

export function getDataTypes({
  hasModels,
  hasTables,
  hasNestedQueriesEnabled,
}: {
  hasTables: boolean;
  hasModels: boolean;
  hasNestedQueriesEnabled: boolean;
}): DataTypeInfoItem[] {
  const dataTypes: DataTypeInfoItem[] = [];

  if (hasNestedQueriesEnabled && hasModels) {
    dataTypes.push(MODELS_INFO_ITEM);
  }

  if (hasTables) {
    dataTypes.push(RAW_DATA_INFO_ITEM);
  }

  return dataTypes;
}
