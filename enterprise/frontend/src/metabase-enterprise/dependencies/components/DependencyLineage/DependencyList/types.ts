export type FilterOption =
  | "verified"
  | "not-verified"
  | "location-collection"
  | "location-dashboard"
  | "collection-official"
  | "collection-not-official"
  | "collection-personal"
  | "collection-not-personal";

export type SortColumn = "name" | "location" | "view-count";

export type SortDirection = "asc" | "desc";

export type SortOptions = {
  column: SortColumn;
  direction: SortDirection;
};

export type SearchOptions = {
  searchQuery: string;
  sortOptions: SortOptions;
};
