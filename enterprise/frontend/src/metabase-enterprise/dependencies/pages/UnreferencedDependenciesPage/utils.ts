import type * as Urls from "metabase/lib/urls";
import type {
  DependencySortColumn,
  DependencySortDirection,
} from "metabase-types/api";

import type { UnreferencedDependenciesRawParams } from "./types";

function parseNumber(number?: string): number | undefined {
  return number != null ? parseInt(number, 10) : undefined;
}

function parseSortColumn(
  sortColumn?: string,
): DependencySortColumn | undefined {
  switch (sortColumn) {
    case "name":
      return sortColumn;
    default:
      return undefined;
  }
}

function parseSortDirection(
  sortDirection?: string,
): DependencySortDirection | undefined {
  switch (sortDirection) {
    case "asc":
    case "desc":
      return sortDirection;
    default:
      return undefined;
  }
}

export function parseRawParams(
  rawParams?: UnreferencedDependenciesRawParams,
): Urls.UnreferencedItemsParams {
  return {
    page: parseNumber(rawParams?.page),
    sortColumn: parseSortColumn(rawParams?.["sort-column"]),
    sortDirection: parseSortDirection(rawParams?.["sort-direction"]),
  };
}

export function getSearchQuery(searchValue: string): string | undefined {
  const searchQuery = searchValue.trim();
  return searchQuery.length > 0 ? searchQuery : undefined;
}
