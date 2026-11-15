export const COLLECTION_CONTENT_COLUMNS = [
  "type",
  "name",
  "description",
  "lastEditedBy",
  "lastEditedAt",
  "actionMenu",
  "archive",
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
