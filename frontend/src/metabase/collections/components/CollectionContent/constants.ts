import type { CollectionItemModel } from "metabase-types/api";

export const COLLECTION_PAGE_SIZE = 25;

export const COLLECTION_CONTENT_COLUMNS = [
  "type",
  "name",
  "lastEditedBy",
  "lastEditedAt",
  "actionMenu",
] as const;

export type CollectionContentTableColumn =
  (typeof COLLECTION_CONTENT_COLUMNS)[number];

export type CollectionContentTableColumnsMap = {
  [key in CollectionContentTableColumn]: true;
};

export const DEFAULT_VISIBLE_COLUMNS_LIST: CollectionContentTableColumn[] = [
  "type",
  "name",
  "lastEditedBy",
  "lastEditedAt",
  "actionMenu",
];

export const ALL_MODELS: CollectionItemModel[] = [
  "dashboard",
  "dataset",
  "card",
  "metric",
  "snippet",
  "collection",
];
