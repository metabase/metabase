import type {
  CardType,
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
  UnreferencedItemType,
} from "metabase-types/api";

export type UnreferencedItemsRawParams = {
  page?: string;
  "sort-column"?: string;
  "sort-direction"?: string;
};

export type UnreferencedItemsFilterOptions = {
  types: UnreferencedItemType[];
  cardTypes: CardType[];
};

export type UnreferencedItemsSortOptions = {
  column: UnreferencedItemSortColumn;
  direction: UnreferencedItemSortDirection;
};

export type UnreferencedItemsPaginationOptions = {
  pageIndex: number;
  pageSize: number;
  total: number;
};
