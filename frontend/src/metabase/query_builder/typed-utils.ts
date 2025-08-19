import type { LocationDescriptorObject } from "history";

import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

type LocationQBModeResult = {
  queryBuilderMode: QueryBuilderMode;
  datasetEditorTab?: DatasetEditorTab;
};

export function getQueryBuilderModeFromLocation(
  location: LocationDescriptorObject,
): LocationQBModeResult {
  const { pathname } = location;
  const lastPathSegment = pathname?.split("/").pop();

  if (lastPathSegment === "notebook") {
    return {
      queryBuilderMode: "notebook",
    };
  }
  if (
    lastPathSegment === "query" ||
    lastPathSegment === "metadata" ||
    lastPathSegment === "columns"
  ) {
    return {
      queryBuilderMode: "dataset",
      datasetEditorTab: lastPathSegment,
    };
  }
  return {
    queryBuilderMode: "view",
  };
}
