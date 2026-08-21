import type { CollectionItemModel } from "metabase-types/api";

export type {
  CollectionContentTableColumn,
  CollectionContentTableColumnsMap,
} from "metabase/common/collections/columns";
export { DEFAULT_VISIBLE_COLUMNS_LIST } from "metabase/common/collections/columns";

export const COLLECTION_PAGE_SIZE = 25;

// Search and type filters appear once a collection has more items than this.
export const FILTERS_VISIBILITY_THRESHOLD = 10;

export const ALL_MODELS: CollectionItemModel[] = [
  "dashboard",
  "dataset",
  "card",
  "metric",
  "snippet",
  "collection",
  "document",
  "table",
  "exploration",
];

export const TYPE_FILTER_MODELS = [
  "collection",
  "dashboard",
  "dataset",
  "card",
  "metric",
  "document",
  "exploration",
  "table",
] as const satisfies readonly CollectionItemModel[];
