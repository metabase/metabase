import type { CollectionItemModel } from "metabase-types/api";

export type {
  CollectionContentTableColumn,
  CollectionContentTableColumnsMap,
} from "metabase/common/collections/columns";
export { DEFAULT_VISIBLE_COLUMNS_LIST } from "metabase/common/collections/columns";

export const COLLECTION_PAGE_SIZE = 25;

export const ALL_MODELS: CollectionItemModel[] = [
  "dashboard",
  "dataset",
  "card",
  "metric",
  "snippet",
  "collection",
  "document",
  "table",
];
