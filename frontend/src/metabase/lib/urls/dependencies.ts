import type {
  DependencyEntry,
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
} from "metabase-types/api";

const GRAPH_BASE_URL = `/data-studio/dependencies`;

export type DependencyGraphParams = {
  entry?: DependencyEntry;
  baseUrl?: string;
};

export function dependencyGraph({
  entry,
  baseUrl = GRAPH_BASE_URL,
}: DependencyGraphParams = {}) {
  const searchParams = new URLSearchParams();
  if (entry != null) {
    searchParams.set("id", String(entry.id));
    searchParams.set("type", entry.type);
  }
  const queryString = searchParams.toString();
  return queryString.length > 0 ? `${baseUrl}?${queryString}` : baseUrl;
}

export type UnreferencedItemsParams = {
  page?: number;
  sortColumn?: UnreferencedItemSortColumn;
  sortDirection?: UnreferencedItemSortDirection;
};

const UNREFERENCED_ITEMS_BASE_URL = `/data-studio/tasks/unreferenced-items`;

export function unreferencedItems({
  page,
  sortColumn,
  sortDirection,
}: UnreferencedItemsParams) {
  const searchParams = new URLSearchParams();
  if (page != null) {
    searchParams.set("page", page.toString());
  }
  if (sortColumn != null) {
    searchParams.set("sortColumn", sortColumn);
  }
  if (sortDirection != null) {
    searchParams.set("sortDirection", sortDirection);
  }
  const queryString = searchParams.toString();
  return queryString.length > 0
    ? `${UNREFERENCED_ITEMS_BASE_URL}?${queryString}`
    : UNREFERENCED_ITEMS_BASE_URL;
}
