export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type SortingOptions<SortColumn extends string> = {
  sort_column: SortColumn;
  sort_direction: SortDirection;
};
