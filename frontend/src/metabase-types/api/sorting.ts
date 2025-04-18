export enum SortDirection {
  Asc = "asc",
  Desc = "desc",
}

export type SortingOptions<SortColumn extends string> = {
  sort_column: SortColumn;
  sort_direction: SortDirection;
};
