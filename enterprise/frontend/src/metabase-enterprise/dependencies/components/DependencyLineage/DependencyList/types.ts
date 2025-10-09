export type SortColumn = "name" | "location" | "view_count";

export type SortDirection = "asc" | "desc";

export type SortOptions = {
  column: SortColumn;
  direction: SortDirection;
};

export type SearchOptions = {
  searchQuery: string;
  sortOptions: SortOptions;
};
