import type { LocationDescriptorObject } from "history";
import type { CardType } from "metabase-types/api";
import type { QueryBuilderMode, DatasetEditorTab } from "metabase-types/store";

type LocationQBModeResult = {
  queryBuilderMode: QueryBuilderMode;
  datasetEditorTab?: DatasetEditorTab;
};

export function getQueryBuilderModeFromLocation(
  location: LocationDescriptorObject,
): LocationQBModeResult {
  const { pathname } = location;
  if (pathname?.endsWith("/notebook")) {
    return {
      queryBuilderMode: "notebook",
    };
  }
  if (pathname?.endsWith("/query") || pathname?.endsWith("/metadata")) {
    return {
      queryBuilderMode: "dataset",
      datasetEditorTab: pathname.endsWith("/query") ? "query" : "metadata",
    };
  }
  return {
    queryBuilderMode: "view",
  };
}

export function getCardTypeFromLocation(
  location: LocationDescriptorObject,
): CardType {
  const { pathname } = location;
  if (pathname?.startsWith("/metric")) {
    return "metric";
  }

  if (pathname?.startsWith("/model")) {
    return "model";
  }

  return "question";
}
