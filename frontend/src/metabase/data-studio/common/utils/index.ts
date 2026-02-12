import type {
  Collection,
  CollectionItem,
  GetLibraryCollectionResponse,
} from "metabase-types/api";

import type { EmptyStateData, TreeItem } from "../types";

export { createEmptyStateItem } from "./create-empty-space-item";
export { getDatasetQueryPreviewUrl } from "./get-dataset-query-preview-url";
export { getResultMetadata } from "./get-result-metadata";

// TODO Alex P 12/05/2025 Fix the endpoint to return sensible data
export const hasLibraryCollection = (
  libraryCollection?: GetLibraryCollectionResponse,
) => libraryCollection != null && "name" in libraryCollection;

export const isCollection = (
  c: Collection | Omit<CollectionItem, "getUrl">,
): c is Collection => {
  return Object.keys(c).includes("namespace");
};

export const isEmptyStateData = (
  data: TreeItem["data"],
): data is EmptyStateData => {
  return data.model === "empty-state";
};
