import type * as Urls from "metabase/lib/urls";
import type {
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
} from "metabase-types/api";

import type { UnreferencedItemsRawParams } from "./types";

function parseNumber(number?: string): number | undefined {
  return number != null ? parseInt(number, 10) : undefined;
}

function parseSortColumn(
  sortColumn?: string,
): UnreferencedItemSortColumn | undefined {
  switch (sortColumn) {
    case "name":
      return sortColumn;
    default:
      return undefined;
  }
}

function parseSortDirection(
  sortDirection?: string,
): UnreferencedItemSortDirection | undefined {
  switch (sortDirection) {
    case "asc":
    case "desc":
      return sortDirection;
    default:
      return undefined;
  }
}

export function parseRawParams(
  rawParams: UnreferencedItemsRawParams,
): Urls.UnreferencedItemsParams {
  return {
    page: parseNumber(rawParams.page),
    sortColumn: parseSortColumn(rawParams.sortColumn),
    sortDirection: parseSortDirection(rawParams.sortDirection),
  };
}

export function getSearchQuery(searchValue: string): string | undefined {
  const searchQuery = searchValue.trim();
  return searchQuery.length > 0 ? searchQuery : undefined;
}
