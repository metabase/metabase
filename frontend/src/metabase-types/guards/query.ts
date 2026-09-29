import type { DatasetQuery, NativeDatasetQuery } from "metabase-types/api";

export function isNativeDatasetQuery(
  datasetQuery: DatasetQuery,
): datasetQuery is NativeDatasetQuery {
  return "type" in datasetQuery && datasetQuery.type === "native";
}
