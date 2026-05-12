import type { GetLibraryCollectionResponse } from "metabase-types/api";

import type {
  CollectionData,
  EmptyStateData,
  TableData,
  TreeItem,
} from "../types";

export { createEmptyStateItem } from "./create-empty-space-item";
export { getDatasetQueryPreviewUrl } from "./get-dataset-query-preview-url";
export { getResultMetadata } from "./get-result-metadata";

// TODO Alex P 12/05/2025 Fix the endpoint to return sensible data
export const hasLibraryCollection = (
  libraryCollection?: GetLibraryCollectionResponse,
) => libraryCollection != null && "name" in libraryCollection;

export const isCollectionData = (
  data: TreeItem["data"],
): data is CollectionData => {
  return data.model === "collection";
};

export const isTableData = (data: TreeItem["data"]): data is TableData => {
  return (
    data.model === "table" && "collection_id" in data && "database_id" in data
  );
};

export const isEmptyStateData = (
  data: TreeItem["data"],
): data is EmptyStateData => {
  return data.model === "empty-state";
};
