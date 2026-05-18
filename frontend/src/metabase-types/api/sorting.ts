export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type SortingOptions<SortColumn extends string> = {
  sort_column: SortColumn;
  sort_direction: SortDirection;
};

export const guardSortDirection = (value: string): value is SortDirection =>
  (SORT_DIRECTIONS satisfies readonly SortDirection[]).includes(
    value as SortDirection,
  );
