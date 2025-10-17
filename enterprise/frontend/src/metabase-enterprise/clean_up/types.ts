import type {
  CollectionId,
  CollectionItem,
  PaginationRequest,
  PaginationResponse,
} from "metabase-types/api";
import type { SortingOptions } from "metabase-types/api/sorting";

export type StaleCollectionItem = CollectionItem & {
  last_used_at: string;
};

export type ListStaleCollectionItemsSortColumn = "name" | "last_used_at";

export type ListStaleCollectionItemsRequest = {
  id: CollectionId;
  before_date?: string;
  is_recursive?: boolean;
} & PaginationRequest &
  Partial<SortingOptions<ListStaleCollectionItemsSortColumn>>;

export type ListStaleCollectionItemsResponse = {
  data: StaleCollectionItem[];
} & PaginationResponse;

export type ArchivedItemRef = {
  id: number;
  model: "card" | "dashboard";
};

export type BulkArchiveStaleItemsRequest = {
  id: CollectionId;
  before_date?: string;
  is_recursive?: boolean;
};

export type BulkArchiveStaleItemsResponse = {
  total_archived: number;
  cards_archived: number;
  dashboards_archived: number;
  archived_ids: ArchivedItemRef[];
};

export type BulkUnarchiveItemsRequest = {
  items: ArchivedItemRef[];
};

export type BulkUnarchiveItemsResponse = {
  total_unarchived: number;
};
